import * as Sentry from "@sentry/node";
import type {
	ConversationSession,
	Invitation,
	Message,
	PrismaClient,
	Scenario,
} from "@workspace/database";
import type { FastifyBaseLogger } from "fastify";
import type { WebSocket } from "ws";
import {
	completeSession,
	createLappScore,
	createMessage,
	getLappScoresForSession,
	getMessagesForSession,
} from "../data/index.js";

//import { DEFAULT_MODEL } from '../lib/constants.js';
const DEFAULT_GOOGLE_MODEL = "google:gemini-2.5-flash";
const DEFAULT_MODEL = DEFAULT_GOOGLE_MODEL;

import { getInvitationQuotaStatus, type Quota } from "../lib/quota.js";
import { TelemetryEvents, track } from "../lib/telemetry.js";
import { streamCompletion } from "../llm/registry.js";
import type { LLMMessage, TokenUsage } from "../llm/types.js";
import { broadcast } from "./broadcaster.js";
import { type HistoryMessage, type ScenarioInfo, send } from "./protocol.js";

// Default models for custom scenarios
// Study conversation partner pinned to Claude Sonnet (PAP v7.8; Hanna 9 Aug 2026).
// With a Claude default here, resolveConfiguredModel no longer silently falls back
// to Gemini for the partner — the partner REQUIRES ANTHROPIC_API_KEY to be set.
const DEFAULT_PARTNER_MODEL = "claude-sonnet-5";
const DEFAULT_COACH_MODEL = DEFAULT_GOOGLE_MODEL;
const DEFAULT_SCORER_MODEL =
	process.env.LAPP_SCORER_MODEL ?? DEFAULT_GOOGLE_MODEL;
// claude-sonnet-4-20250514 is deprecated/retired; claude-sonnet-5 is its drop-in replacement
const FALLBACK_PARTNER_MODEL = "claude-sonnet-5";
const COACH_TIMEOUT_MS = 12_000;
const LAPP_SCORE_TIMEOUT_MS = 15_000;
// LAPP scorer instrument version — stored on every score row for reproducibility/
// audit. Bump when the prompt, schema, model default, or sampling params change.
const LAPP_SCORER_VERSION = "lapp-v1-2026-08-08";
// Gemini structured-output schema: forces valid {l,a,p,pe: int, tone: enum} so the
// scorer cannot return unparseable output (which previously triggered a fabricated
// heuristic score). Types use Gemini's uppercase Type enum values.
const LAPP_RESPONSE_SCHEMA = {
	type: "OBJECT",
	properties: {
		l: { type: "INTEGER" },
		a: { type: "INTEGER" },
		p: { type: "INTEGER" },
		pe: { type: "INTEGER" },
		tone: {
			type: "STRING",
			enum: ["constructive", "warm", "neutral", "tense"],
		},
	},
	required: ["l", "a", "p", "pe", "tone"],
	propertyOrdering: ["l", "a", "p", "pe", "tone"],
} as const;
const CURRENT_FACT_CONTEXT = `
Runtime factual context:
- Today is August 6, 2026.
- The current U.S. president is Donald J. Trump, sworn in on January 20, 2025.
- For current-events or "right now" factual questions, use web search/grounding when available and let current evidence override stale model memory.
- Do not claim Joe Biden is the current U.S. president unless current search evidence explicitly says that.
`;

const ASIDE_INSTRUCTIONS = `
When responding to an aside question (marked with [ASIDE QUESTION]):
- You are stepping out of the main coaching flow to answer a specific question
- Reference specific parts of the conversation when relevant
- Keep responses focused and concise
- Do not continue the main coaching narrative
`;

function shouldFallbackFromGemini(
	errorMessage?: string,
	errorCode?: string,
): boolean {
	if (!errorMessage && !errorCode) return false;

	const normalizedMessage = errorMessage?.toLowerCase() ?? "";
	const normalizedCode = errorCode?.toUpperCase() ?? "";

	return (
		normalizedCode === "HTTP_429" ||
		normalizedCode === "HTTP_404" ||
		normalizedMessage.includes("quota") ||
		normalizedMessage.includes("not found") ||
		normalizedMessage.includes("google_ai_api_key") ||
		normalizedMessage.includes("api key") ||
		normalizedMessage.includes("api_key") ||
		normalizedMessage.includes("authentication") ||
		normalizedMessage.includes("permission denied") ||
		normalizedMessage.includes("forbidden") ||
		normalizedMessage.includes("unauthorized")
	);
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

function toIsoString(value: unknown): string {
	if (value instanceof Date) return value.toISOString();
	if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
		return (value as { toDate: () => Date }).toDate().toISOString();
	}
	if (typeof value === "string") return value;
	return new Date().toISOString();
}

function hasGoogleProvider(): boolean {
	return !!process.env.GOOGLE_CLOUD_PROJECT || !!process.env.GOOGLE_AI_API_KEY;
}

function hasAnthropicProvider(): boolean {
	return !!process.env.ANTHROPIC_API_KEY;
}

function isAnthropicModel(modelString: string): boolean {
	return (
		modelString.startsWith("anthropic:") || modelString.startsWith("claude")
	);
}

function resolveConfiguredModel(
	modelString: string,
	fallbackModel = DEFAULT_COACH_MODEL,
): string {
	if (
		isAnthropicModel(modelString) &&
		!hasAnthropicProvider() &&
		hasGoogleProvider()
	) {
		return fallbackModel;
	}
	return modelString;
}

function isLikelyIncompleteCoachMessage(content: string): boolean {
	const trimmed = content.trim();
	if (trimmed.length < 24) return true;
	return !/[.!?]"?$/.test(trimmed);
}

type LappTone = "constructive" | "warm" | "neutral" | "tense";
type LappScores = { l: number; a: number; p: number; pe: number };

function clampLappScore(value: unknown): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.min(5, Math.max(0, Math.round(parsed)));
}

function normalizeTone(value: unknown): LappTone {
	const tone = String(value ?? "").toLowerCase();
	if (tone === "constructive" || tone === "warm" || tone === "tense")
		return tone;
	return "neutral";
}

function parseJsonObject(content: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(content);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		const match = content.match(/\{[\s\S]*\}/);
		if (!match) return null;
		try {
			const parsed = JSON.parse(match[0]);
			return parsed && typeof parsed === "object" && !Array.isArray(parsed)
				? (parsed as Record<string, unknown>)
				: null;
		} catch {
			return null;
		}
	}
}

function looksLikeCurrentFactQuestion(content: string): boolean {
	return /\b(current|today|right now|latest|recent|news|president|governor|mayor|prime minister|what year|who is|when is|as of)\b/i.test(
		content,
	);
}

// Added missing fields to the interface to resolve TS2339 and TS2551.
// `id` is widened because Firestore returns string document ids while the
// Prisma-derived ConversationSession still types it as number, so the base
// field is omitted rather than re-declared (a plain override is a TS2430).
interface SessionWithScenario extends Omit<ConversationSession, "id"> {
	id: string | number;
	scenario: Scenario | null;
	invitation: Invitation | null;
	messages: Message[];
	invitationId: string | null;
	userId: string | null;
	customPartnerPersona: string | null;
	customScenarioName: string | null;
	customDescription: string | null;
	customPartnerPrompt: string | null;
	customCoachPrompt: string | null;
	studySource?: string | null;
	studyTopic?: string | null;
	studyCondition?: number | null;
	studyCoachEnabled?: boolean | null;
}

export class ConversationManager {
	private ws: WebSocket;
	private db: PrismaClient;
	private prisma: PrismaClient;
	private session: SessionWithScenario;
	private logger: FastifyBaseLogger;
	private isProcessing = false;
	private activeAsideController: AbortController | null = null;
	private activeAsideThreadId: string | null = null;

	constructor(
		ws: WebSocket,
		db: PrismaClient,
		session: SessionWithScenario,
		logger: FastifyBaseLogger,
	) {
		this.ws = ws;
		this.db = db;
		this.prisma = db;
		this.session = session;
		this.logger = logger;
	}

	async initialize(): Promise<void> {
		const scenario = this.session.scenario;

		let scenarioInfo: ScenarioInfo;
		if (scenario) {
			scenarioInfo = {
				id: scenario.id,
				name: scenario.name,
				description: scenario.description,
				partnerPersona: scenario.partnerPersona,
			};
		} else if (this.session.customPartnerPersona) {
			scenarioInfo = {
				id: 0,
				name: this.session.customScenarioName ?? "Custom Scenario",
				description:
					this.session.customDescription ?? "User-defined conversation partner",
				partnerPersona: this.session.customPartnerPersona,
				isCustom: true,
			};
		} else {
			throw new Error("Session has neither scenario nor custom prompts");
		}

		send(this.ws, {
			type: "connected",
			sessionId: this.session.id,
			scenario: scenarioInfo,
			study:
				this.session.studySource === "qualtrics_prolific"
					? {
							source: "qualtrics_prolific",
							topic: this.session.studyTopic ?? "",
							condition: this.session.studyCondition === 1 ? 1 : 0,
							coachEnabled: this.isCoachEnabled(),
							participantTurnCount: this.countParticipantTurns(),
							softCapSeconds: 7 * 60,
							hardStopSeconds: 8 * 60,
							minParticipantTurns: 6,
						}
					: undefined,
		});

		const historyMessages: HistoryMessage[] = this.session.messages.map(
			(m) => ({
				id: m.id,
				role: m.role as "user" | "partner" | "coach",
				content: m.content,
				timestamp: toIsoString(m.timestamp),
				messageType: (m.messageType as "main" | "aside") ?? "main",
				asideThreadId: m.asideThreadId ?? undefined,
			}),
		);

		send(this.ws, { type: "history", messages: historyMessages });

		// Replay persisted LAPP scores so the panel restores on re-open
		const existingScores = await getLappScoresForSession(
			String(this.session.id),
		);
		for (const score of existingScores) {
			const validTones = ["constructive", "warm", "neutral", "tense"] as const;
			const tone = validTones.includes(
				score.tone as (typeof validTones)[number],
			)
				? (score.tone as (typeof validTones)[number])
				: ("neutral" as const);
			send(this.ws, {
				type: "score:update",
				userMessageId: score.userMessageId,
				turnNumber: score.turnNumber,
				scores: { l: score.l, a: score.a, p: score.p, pe: score.pe },
				tone,
			});
		}
	}

	async handleUserMessage(content: string): Promise<void> {
		if (this.isProcessing) {
			send(this.ws, {
				type: "error",
				code: "RATE_LIMITED",
				message: "Please wait for the current response to complete",
				recoverable: true,
			});
			return;
		}

		this.isProcessing = true;

		try {
			if (this.session.invitationId) {
				const hasQuota = await this.checkQuotaAllowed();
				if (!hasQuota) {
					send(this.ws, { type: "quota:exhausted" });
					return;
				}
			}

			const userMsg = await this.persistMessage("user", content);
			this.session.messages.push(userMsg);

			const turnNumber = this.session.messages.filter(
				(m) => m.role === "user",
			).length;
			await track(
				this.prisma,
				TelemetryEvents.MESSAGE_SENT,
				{ length: content.length, turnNumber },
				{
					userId: this.session.userId ?? undefined,
					sessionId: this.session.id,
				},
			);

			broadcast(this.session.id, {
				type: "history",
				messages: [
					{
						id: userMsg.id,
						role: "user",
						content: userMsg.content,
						timestamp: toIsoString(userMsg.timestamp),
					},
				],
			});

			const partnerStart = Date.now();
			const partnerResult = await this.streamResponse("partner");
			this.logTiming("partner", partnerStart, {
				turnNumber,
				completed: !!partnerResult,
			});
			if (!partnerResult) {
				this.isProcessing = false;
				return;
			}

			// Skip coach on the first exchange — let the user form their own response first.
			const isFirstExchange =
				this.session.messages.filter((m) => m.role === "user").length === 1;

			send(this.ws, { type: "exchange:complete" });
			await this.logUsage(partnerResult.usage, null);
			await this.checkQuotaWarning();

			if (!isFirstExchange) {
				void this.runPostExchangeJobs({
					userMessageId: userMsg.id,
					userMessage: content,
					partnerMessage: partnerResult.content,
					turnNumber,
				});
			}
		} catch (error) {
			const message = errorMessage(error);
			this.logger.error(
				{ sessionId: this.session.id, error, errorMsg: message },
				"Error handling user message",
			);
			Sentry.captureException(error, { extra: { sessionId: this.session.id } });
			send(this.ws, {
				type: "error",
				code: "INTERNAL_ERROR",
				message,
				recoverable: true,
			});
		} finally {
			this.isProcessing = false;
		}
	}

	private logTiming(
		lane: "partner" | "coach" | "lapp",
		startMs: number,
		extra: Record<string, unknown> = {},
	): void {
		this.logger.info(
			{
				sessionId: this.session.id,
				lane,
				durationMs: Date.now() - startMs,
				...extra,
			},
			"[timing] AI lane complete",
		);
	}

	private async runPostExchangeJobs(args: {
		userMessageId: string | number;
		userMessage: string;
		partnerMessage: string;
		turnNumber: number;
	}): Promise<void> {
		const coachJob = this.isCoachEnabled()
			? this.generateCoachInsight(args).catch((error: unknown) => {
					this.logger.warn(
						{
							sessionId: this.session.id,
							turnNumber: args.turnNumber,
							errorMsg: errorMessage(error),
						},
						"[coach] Isolated coach job failed",
					);
				})
			: Promise.resolve();
		const lappJob = this.runLappScorer(
			args.userMessageId,
			args.userMessage,
			args.partnerMessage,
			args.turnNumber,
		).catch((error: unknown) => {
			this.logger.warn(
				{
					sessionId: this.session.id,
					userMessageId: args.userMessageId,
					turnNumber: args.turnNumber,
					errorMsg: errorMessage(error),
				},
				"[lapp] Isolated LAPP job failed",
			);
		});

		await Promise.allSettled([coachJob, lappJob]);
	}

	private isCoachEnabled(): boolean {
		return this.session.studySource === "qualtrics_prolific"
			? this.session.studyCoachEnabled === true && this.session.studyCondition === 1
			: true;
	}

	private countParticipantTurns(): number {
		return this.session.messages.filter(
			(m) => m.role === "user" && m.messageType !== "aside",
		).length;
	}

	async handleResume(afterMessageId?: string | number): Promise<void> {
		const allMessages = await getMessagesForSession(String(this.session.id));
		const afterIndex =
			afterMessageId === undefined
				? -1
				: allMessages.findIndex((m) => String(m.id) === String(afterMessageId));
		const messages =
			afterIndex >= 0 ? allMessages.slice(afterIndex + 1) : allMessages;

		const historyMessages: HistoryMessage[] = messages.map((m) => ({
			id: m.id,
			role: m.role as "user" | "partner" | "coach",
			content: m.content,
			timestamp: toIsoString(m.timestamp),
			messageType: (m.messageType as "main" | "aside") ?? "main",
			asideThreadId: m.asideThreadId ?? undefined,
		}));

		send(this.ws, { type: "history", messages: historyMessages });
	}

	private async streamResponse(role: "partner" | "coach"): Promise<{
		content: string;
		messageId: string | number;
		usage: TokenUsage;
	} | null> {
		const scenario = this.session.scenario;

		let modelString: string;
		let systemPrompt: string;

		if (scenario) {
			modelString =
				role === "partner"
					? (scenario.partnerModel ?? DEFAULT_PARTNER_MODEL)
					: (scenario.coachModel ?? DEFAULT_COACH_MODEL);
			modelString = resolveConfiguredModel(
				modelString,
				role === "partner" ? DEFAULT_PARTNER_MODEL : DEFAULT_COACH_MODEL,
			);
			systemPrompt =
				role === "partner"
					? (scenario.partnerSystemPrompt ?? scenario.description)
					: (scenario.coachSystemPrompt ?? scenario.description);
		} else if (
			this.session.customPartnerPrompt &&
			this.session.customCoachPrompt
		) {
			modelString =
				role === "partner" ? DEFAULT_PARTNER_MODEL : DEFAULT_COACH_MODEL;
			systemPrompt =
				role === "partner"
					? this.session.customPartnerPrompt
					: this.session.customCoachPrompt;
		} else {
			throw new Error("Session has neither scenario nor custom prompts");
		}

		if (role === "partner") {
			systemPrompt += `\n\n${CURRENT_FACT_CONTEXT}\nKeep responses to 2-3 sentences. Do not ask follow-up questions.`;
		}
		if (role === "coach") {
			systemPrompt +=
				"\n\nIMPORTANT: Keep coaching feedback SHORT. When the user is doing the right thing, give ONE complete brief sentence of acknowledgment and nothing else — no next steps, no examples, no elaboration. Only add a suggestion or example when the user makes a specific mistake or is clearly stuck. Two complete sentences absolute maximum in any case. Always finish the final sentence.";
		}

		const context = this.buildContext(role);
		let useWebSearch =
			role === "partner"
				? (this.session.scenario?.partnerUseWebSearch ?? false)
				: (this.session.scenario?.coachUseWebSearch ?? false);
		if (role === "partner" && useWebSearch) {
			const latestUserMessage =
				this.session.messages
					.filter((m) => m.role === "user" && m.messageType !== "aside")
					.at(-1)?.content ?? "";
			useWebSearch = looksLikeCurrentFactQuestion(latestUserMessage);
			if (!useWebSearch) {
				this.logger.info(
					{ sessionId: this.session.id, role },
					"[stream] Skipping web search for non-current dialogue turn",
				);
			}
		}
		return await this.tryStreamWithFallback(
			role,
			modelString,
			systemPrompt,
			context,
			useWebSearch,
		);
	}

	private async tryStreamWithFallback(
		role: "partner" | "coach",
		modelString: string,
		systemPrompt: string,
		context: LLMMessage[],
		useWebSearch = false,
	): Promise<{
		content: string;
		messageId: string | number;
		usage: TokenUsage;
	} | null> {
		const isGeminiModel =
			modelString.startsWith("google:") || modelString.includes("gemini");
		let currentModel = modelString;
		let usedFallback = false;

		for (let attempt = 0; attempt < 2; attempt++) {
			// On fallback attempt, signal frontend to clear partial content from first attempt
			if (attempt === 1 && role === "partner") {
				send(this.ws, { type: "partner:retry" });
			}
			let fullContent = "";
			let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
			let retries = 0;
			const maxRetries = 2;

			while (retries <= maxRetries) {
				try {
					fullContent = "";
					// Caps, not targets: prompts keep replies short, so non-thinking
					// models are unaffected. Thinking models (Gemini 3+) spend part of
					// this budget on reasoning — tight caps truncate their text
					// mid-sentence (bug F9).
					const maxTokens = role === "coach" ? 512 : 1024;

					this.logger.info(
						{
							sessionId: this.session.id,
							role,
							model: currentModel,
							attempt,
							retries,
						},
						"[stream] Starting LLM stream",
					);

					for await (const chunk of streamCompletion(currentModel, {
						systemPrompt,
						messages: context,
						maxTokens,
						useWebSearch,
					})) {
						if (chunk.type === "delta" && chunk.content) {
							fullContent += chunk.content;
							const deltaType =
								role === "partner" ? "partner:delta" : "coach:delta";
							send(this.ws, { type: deltaType, content: chunk.content });
							broadcast(this.session.id, {
								type: deltaType,
								content: chunk.content,
							});
						} else if (chunk.type === "done" && chunk.usage) {
							usage = chunk.usage;
							this.logger.info(
								{
									sessionId: this.session.id,
									role,
									model: currentModel,
									inputTokens: chunk.usage.inputTokens,
									outputTokens: chunk.usage.outputTokens,
									contentLength: fullContent.length,
								},
								"[stream] LLM stream done",
							);
						} else if (chunk.type === "error" && chunk.error) {
							this.logger.warn(
								{
									sessionId: this.session.id,
									role,
									model: currentModel,
									errorCode: chunk.error.code,
									errorMsg: chunk.error.message,
									retryable: chunk.error.retryable,
								},
								"[stream] LLM chunk error",
							);
							if (
								isGeminiModel &&
								shouldFallbackFromGemini(
									chunk.error.message,
									chunk.error.code,
								) &&
								hasAnthropicProvider() &&
								!usedFallback
							) {
								this.logger.info(
									{
										sessionId: this.session.id,
										role,
										fallbackModel: FALLBACK_PARTNER_MODEL,
									},
									"[stream] Gemini unavailable — switching to fallback model",
								);
								currentModel = FALLBACK_PARTNER_MODEL;
								useWebSearch = false;
								usedFallback = true;
								break;
							}
							if (chunk.error.retryable && retries < maxRetries) {
								retries++;
								this.logger.info(
									{
										sessionId: this.session.id,
										role,
										model: currentModel,
										retries,
									},
									"[stream] Retryable error — retrying",
								);
								await sleep(1000 * retries);
								continue;
							}
							throw new Error(chunk.error.message);
						}
					}

					if (usedFallback && attempt === 0) break; // break while loop so for loop advances to attempt=1

					if (fullContent.trim().length === 0) {
						this.logger.warn(
							{
								sessionId: this.session.id,
								role,
								model: currentModel,
								attempt,
								retries,
							},
							"[stream] LLM stream completed with empty content",
						);
						// If Gemini returned empty and Anthropic is configured, try Claude as a fallback.
						if (isGeminiModel && hasAnthropicProvider() && !usedFallback) {
							this.logger.info(
								{
									sessionId: this.session.id,
									role,
									fallbackModel: FALLBACK_PARTNER_MODEL,
								},
								"[stream] Empty response from Gemini — switching to fallback model",
							);
							currentModel = FALLBACK_PARTNER_MODEL;
							useWebSearch = false;
							usedFallback = true;
							break; // break while loop so for loop advances to attempt=1
						}
						send(this.ws, {
							type: "error",
							code: "PROVIDER_ERROR",
							message:
								"AI service returned an empty response. Please try again.",
							recoverable: true,
						});
						return null;
					}

					if (role === "coach" && isLikelyIncompleteCoachMessage(fullContent)) {
						this.logger.warn(
							{
								sessionId: this.session.id,
								role,
								model: currentModel,
								attempt,
								retries,
								contentPreview: fullContent.trim().slice(0, 80),
							},
							"[stream] Coach response looked incomplete",
						);
						if (retries < maxRetries) {
							retries++;
							send(this.ws, { type: "coach:retry" });
							broadcast(this.session.id, { type: "coach:retry" });
							await sleep(500 * retries);
							continue;
						}
						return null;
					}

					const message = await this.persistMessage(role, fullContent.trim());
					this.session.messages.push(message);

					this.logger.info(
						{
							sessionId: this.session.id,
							role,
							model: currentModel,
							messageId: message.id,
							contentLength: fullContent.trim().length,
						},
						"[stream] Response persisted and sent",
					);

					const doneType = role === "partner" ? "partner:done" : "coach:done";
					// Fix lint: noExplicitAny
					const doneMsg = {
						type: doneType as "partner:done" | "coach:done",
						messageId: message.id,
						usage,
						content: fullContent.trim(),
					};
					send(this.ws, doneMsg);
					broadcast(this.session.id, doneMsg);

					await track(
						this.prisma,
						TelemetryEvents.STREAM_COMPLETED,
						{
							role,
							model: currentModel,
							inputTokens: usage.inputTokens,
							outputTokens: usage.outputTokens,
							contentLength: fullContent.trim().length,
							usedFallback,
						},
						{
							userId: this.session.userId ?? undefined,
							sessionId: this.session.id,
						},
					);

					return { content: fullContent, messageId: message.id, usage };
				} catch (error) {
					const errorMsg =
						error instanceof Error ? error.message : String(error);
					this.logger.error(
						{
							sessionId: this.session.id,
							role,
							model: currentModel,
							attempt,
							retries,
							errorMsg,
						},
						"[stream] Provider error in tryStreamWithFallback",
					);
					Sentry.captureException(error, {
						extra: {
							sessionId: this.session.id,
							role,
							model: currentModel,
							attempt,
							retries,
						},
					});
					if (
						isGeminiModel &&
						hasAnthropicProvider() &&
						shouldFallbackFromGemini(errorMsg) &&
						!usedFallback
					) {
						currentModel = FALLBACK_PARTNER_MODEL;
						useWebSearch = false;
						usedFallback = true;
						break;
					}

					if (retries < maxRetries) {
						retries++;
						await sleep(1000 * retries);
						continue;
					}

					// Fixed the incorrect object literal syntax here (TS2353)
					if (role !== "coach" && fullContent.length > 0) {
						await this.persistMessage(role, fullContent, {
							metadata: {
								complete: false,
								error: "PROVIDER_ERROR",
							},
						});
					}

					send(this.ws, {
						type: "error",
						code: "PROVIDER_ERROR",
						message: "AI service temporarily unavailable",
						recoverable: true,
					});
					return null;
				}
			}
		}
		return null;
	}

	private async runLappScorer(
		userMessageId: string | number,
		userMessage: string,
		partnerMessage: string,
		turnNumber: number,
	): Promise<void> {
		const startMs = Date.now();
		const model = resolveConfiguredModel(
			DEFAULT_SCORER_MODEL,
			DEFAULT_SCORER_MODEL,
		);

		try {
			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				LAPP_SCORE_TIMEOUT_MS,
			);
			let content = "";

			try {
				for await (const chunk of streamCompletion(model, {
					systemPrompt:
						"You are a JSON-only LAPP dialogue scorer. Score only the user message in context of the partner reply. Return exactly one JSON object and no prose.",
					messages: [
						{
							role: "user",
							content: [
								`Turn: ${turnNumber}`,
								`User message: ${userMessage}`,
								`Partner reply: ${partnerMessage}`,
								"Use 0-5 integer scores for:",
								"l = listen/reflect the partner concern",
								"a = acknowledge emotion or values",
								"p = pivot with curiosity or a useful question",
								"pe = perspective/explains own view constructively",
								"tone must be one of constructive, warm, neutral, tense.",
								'Return shape: {"l":0,"a":0,"p":0,"pe":0,"tone":"neutral"}',
							].join("\n"),
						},
					],
					maxTokens: 256,
					responseMimeType: "application/json",
					responseSchema: LAPP_RESPONSE_SCHEMA,
					temperature: 0,
					signal: controller.signal,
				})) {
					if (chunk.type === "delta" && chunk.content) {
						content += chunk.content;
					} else if (chunk.type === "error" && chunk.error) {
						throw new Error(chunk.error.message);
					}
				}
			} finally {
				clearTimeout(timeout);
			}

			const parsed = parseJsonObject(content);
			if (!parsed) {
				throw new Error(
					`LAPP scorer returned non-JSON output: ${content.slice(0, 120)}`,
				);
			}

			const scores: LappScores = {
				l: clampLappScore(parsed.l),
				a: clampLappScore(parsed.a),
				p: clampLappScore(parsed.p),
				pe: clampLappScore(parsed.pe),
			};
			const tone = normalizeTone(parsed.tone);

			await this.persistLappScore(
				userMessageId,
				turnNumber,
				scores,
				tone,
				"ai",
				model,
			);
			this.logTiming("lapp", startMs, {
				userMessageId,
				turnNumber,
				model,
				scorer: "ai",
				scores,
				tone,
			});
		} catch (error) {
			// Honesty over coverage: on genuine scorer failure we SKIP this turn
			// rather than fabricate a heuristic score the participant would act on.
			// A missing turn behaves like turn 1 (no score); the panel tolerates gaps.
			this.logger.warn(
				{
					sessionId: this.session.id,
					userMessageId,
					turnNumber,
					model,
					errorMsg: errorMessage(error),
				},
				"[lapp] AI scoring failed; skipping this turn (no fabricated fallback)",
			);
			this.logTiming("lapp", startMs, {
				userMessageId,
				turnNumber,
				model,
				scorer: "skipped",
			});
		}
	}

	private async generateCoachInsight(args: {
		userMessageId: string | number;
		userMessage: string;
		partnerMessage: string;
		turnNumber: number;
	}): Promise<void> {
		const startMs = Date.now();
		const scenario = this.session.scenario;
		const model = resolveConfiguredModel(
			scenario?.coachModel ?? DEFAULT_COACH_MODEL,
		);
		const basePrompt =
			scenario?.coachSystemPrompt ??
			this.session.customCoachPrompt ??
			"You coach users on constructive difficult conversations.";
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), COACH_TIMEOUT_MS);
		let content = "";
		let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

		try {
			for await (const chunk of streamCompletion(model, {
				systemPrompt: [
					basePrompt,
					CURRENT_FACT_CONTEXT,
					"You are the coach only. You are not the partner character.",
					"Give one short, complete coaching insight to the user about their latest reply.",
					"Do not role-play the partner. Do not answer as the partner. Do not continue the partner conversation.",
					"If the user asked a factual aside, coach how that affected dialogue instead of answering as the partner.",
					"Use one or two complete sentences. Always finish the final sentence.",
				].join("\n\n"),
				messages: [
					{
						role: "user",
						content: [
							`Turn: ${args.turnNumber}`,
							`User message: ${args.userMessage}`,
							`Partner reply: ${args.partnerMessage}`,
							"Return only the coaching insight text.",
						].join("\n"),
					},
				],
				maxTokens: 220,
				signal: controller.signal,
			})) {
				if (chunk.type === "delta" && chunk.content) {
					content += chunk.content;
				} else if (chunk.type === "done" && chunk.usage) {
					usage = chunk.usage;
				} else if (chunk.type === "error" && chunk.error) {
					throw new Error(chunk.error.message);
				}
			}
		} finally {
			clearTimeout(timeout);
		}

		let trimmed = content.trim();
		if (!trimmed || isLikelyIncompleteCoachMessage(trimmed)) {
			// Usually a maxTokens truncation mid-sentence. Salvage the complete
			// sentences instead of silently giving the user no coaching this turn.
			const lastStop = Math.max(
				trimmed.lastIndexOf("."),
				trimmed.lastIndexOf("!"),
				trimmed.lastIndexOf("?"),
			);
			const salvaged = lastStop >= 24 ? trimmed.slice(0, lastStop + 1) : "";
			if (!salvaged) {
				this.logger.warn(
					{
						sessionId: this.session.id,
						userMessageId: args.userMessageId,
						turnNumber: args.turnNumber,
						model,
						contentPreview: trimmed.slice(0, 120),
					},
					"[coach] Dropping incomplete coach insight",
				);
				this.logTiming("coach", startMs, {
					userMessageId: args.userMessageId,
					turnNumber: args.turnNumber,
					model,
					completed: false,
				});
				return;
			}
			this.logger.info(
				{ sessionId: this.session.id, turnNumber: args.turnNumber, model },
				"[coach] Salvaged truncated coach insight to last complete sentence",
			);
			trimmed = salvaged;
		}

		const message = await this.persistMessage("coach", trimmed);
		this.session.messages.push(message);
		send(this.ws, {
			type: "coach:done",
			messageId: message.id,
			usage,
			content: trimmed,
		});
		broadcast(this.session.id, {
			type: "coach:done",
			messageId: message.id,
			usage,
			content: trimmed,
		});
		this.logTiming("coach", startMs, {
			userMessageId: args.userMessageId,
			turnNumber: args.turnNumber,
			model,
			completed: true,
		});
	}

	private async persistLappScore(
		userMessageId: string | number,
		turnNumber: number,
		scores: LappScores,
		tone: LappTone,
		scorer: "ai" | "fallback",
		model: string,
	): Promise<void> {
		await createLappScore(String(this.session.id), {
			userMessageId,
			turnNumber,
			...scores,
			tone,
			// Provenance for reproducibility/audit (Firestore is schemaless; these
			// extra fields ride through the existing cast). `source` is always "ai"
			// now that the fabricated fallback is gone, but kept for auditability.
			source: scorer,
			model,
			scorerVersion: LAPP_SCORER_VERSION,
		} as unknown as Parameters<typeof createLappScore>[1]);

		send(this.ws, {
			type: "score:update",
			userMessageId,
			turnNumber,
			scores,
			tone,
		});
		this.logger.info(
			{
				sessionId: this.session.id,
				userMessageId,
				turnNumber,
				scores,
				tone,
				scorer,
			},
			"[lapp] Score persisted and sent",
		);
	}

	private buildContext(role: "partner" | "coach"): LLMMessage[] {
		const messages = this.session.messages;
		if (role === "partner") {
			return messages
				.filter(
					(m) =>
						(m.role === "user" || m.role === "partner") &&
						m.content.trim().length > 0,
				)
				.map((m) => ({
					role: m.role === "user" ? "user" : "assistant",
					content: m.content.trim(),
				})) as LLMMessage[];
		}

		// For coach: group messages into exchanges (user + partner + optional coach)
		// and emit proper alternating user/assistant pairs.
		// This avoids consecutive assistant messages that confuse the model into
		// reproducing the partner's content.
		type Exchange = { user: string; partner: string; coach?: string };
		const exchanges: Exchange[] = [];
		let i = 0;
		while (i < messages.length) {
			const m = messages[i];
			if (m.role === "user") {
				const exchange: Exchange = { user: m.content.trim(), partner: "" };
				i++;
				if (i < messages.length && messages[i].role === "partner") {
					exchange.partner = messages[i].content.trim();
					i++;
				}
				if (i < messages.length && messages[i].role === "coach") {
					exchange.coach = messages[i].content.trim();
					i++;
				}
				// Skip exchanges where the partner response is empty (e.g. from a previous failed stream)
				if (!exchange.partner) {
					continue;
				}
				exchanges.push(exchange);
			} else {
				i++;
			}
		}

		const result: LLMMessage[] = [];
		for (let j = 0; j < exchanges.length; j++) {
			const ex = exchanges[j];
			const isLast = j === exchanges.length - 1;
			const userContent = `The user said: "${ex.user}"\nThe partner responded: "${ex.partner}"`;
			result.push({ role: "user" as const, content: userContent });
			if (ex.coach) {
				result.push({ role: "assistant" as const, content: ex.coach });
			} else if (!isLast) {
				// First exchange had no coach — insert placeholder to maintain alternation
				result.push({
					role: "assistant" as const,
					content: "[No feedback given for this exchange]",
				});
			}
		}
		return result;
	}

	private async persistMessage(
		role: string,
		content: string,
		options?: {
			metadata?: Record<string, unknown>;
			messageType?: "main" | "aside";
			asideThreadId?: string;
		},
	): Promise<Message> {
		const id = await createMessage(String(this.session.id), {
			role,
			content,
			metadata: options?.metadata as unknown as Message["metadata"],
			messageType: options?.messageType ?? "main",
			asideThreadId: options?.asideThreadId,
		} as unknown as Parameters<typeof createMessage>[1]);
		return {
			id: id as unknown as Message["id"],
			sessionId: this.session.id,
			role,
			content,
			timestamp: new Date(),
			metadata: options?.metadata as unknown as Message["metadata"],
			messageType: options?.messageType ?? "main",
			asideThreadId: options?.asideThreadId ?? null,
			audioUrl: null,
		} as Message;
	}

	private async logUsage(
		partnerUsage: TokenUsage,
		coachUsage: TokenUsage | null,
	): Promise<void> {
		const scenario = this.session.scenario;
		const partnerModel = resolveConfiguredModel(
			scenario?.partnerModel ?? DEFAULT_PARTNER_MODEL,
		);
		const coachModel = resolveConfiguredModel(
			scenario?.coachModel ?? DEFAULT_COACH_MODEL,
		);

		const partnerEntry = {
			sessionId: this.session.id,
			userId: this.session.userId,
			invitationId: this.session.invitationId,
			model: partnerModel,
			streamType: "partner",
			inputTokens: partnerUsage.inputTokens,
			outputTokens: partnerUsage.outputTokens,
		};

		if (!coachUsage) {
			await this.db.usageLog.create({ data: partnerEntry });
			return;
		}

		await this.db.usageLog.createMany({
			data: [
				partnerEntry,
				{
					sessionId: this.session.id,
					userId: this.session.userId,
					invitationId: this.session.invitationId,
					model: coachModel,
					streamType: "coach",
					inputTokens: coachUsage.inputTokens,
					outputTokens: coachUsage.outputTokens,
				},
			],
		});
	}

	private async checkQuotaAllowed(): Promise<boolean> {
		if (!this.session.invitationId) return true;
		const invitation = await this.db.invitation.findUnique({
			where: { id: this.session.invitationId },
		});
		if (!invitation) return false;
		const quota = invitation.quota as unknown as Quota;
		const status = await getInvitationQuotaStatus(
			this.prisma,
			invitation.id,
			quota,
		);
		return status.allowed;
	}

	private async checkQuotaWarning(): Promise<void> {
		if (!this.session.invitationId) return;
		const invitation = await this.db.invitation.findUnique({
			where: { id: this.session.invitationId },
		});
		if (!invitation) return;
		const quota = invitation.quota as unknown as Quota;
		if (!quota?.tokens) return;
		const status = await getInvitationQuotaStatus(
			this.prisma,
			invitation.id,
			quota,
		);
		if (!status.allowed) {
			send(this.ws, { type: "quota:exhausted" });
		} else if (status.remaining < quota.tokens * 0.2) {
			send(this.ws, {
				type: "quota:warning",
				remaining: status.remaining,
				total: status.total,
			});
		}
	}

	async onClose(reason: "idle_timeout" | "disconnect"): Promise<void> {
		if (reason === "disconnect") return;

		const now = new Date();
		const result = await completeSession(String(this.session.id), now);
		if (!result.completed) return;
		const durationMs = result.durationSeconds * 1000;

		await track(
			this.prisma,
			TelemetryEvents.CONVERSATION_ENDED,
			{
				reason,
				durationMs,
				totalMessages: this.session.messages.length,
				scenarioSlug:
					this.session.scenario?.slug ??
					(this.session.customPartnerPersona ? "custom" : null),
			},
			{ userId: this.session.userId ?? undefined, sessionId: this.session.id },
		);
	}

	async handleAsideStart(threadId: string, question: string): Promise<void> {
		if (!this.isCoachEnabled()) {
			send(this.ws, {
				type: "aside:error",
				threadId,
				error: "Coach is not available for this session.",
			});
			return;
		}

		if (this.isProcessing || this.activeAsideThreadId) {
			send(this.ws, {
				type: "aside:error",
				threadId,
				error: "Response in progress",
			});
			return;
		}
		this.isProcessing = true;
		this.activeAsideThreadId = threadId;
		this.activeAsideController = new AbortController();

		try {
			const userMsg = await this.persistMessage("user", question, {
				messageType: "aside",
				asideThreadId: threadId,
			});
			this.session.messages.push(userMsg);
			broadcast(this.session.id, {
				type: "history",
				messages: [
					{
						id: userMsg.id,
						role: "user",
						content: userMsg.content,
						timestamp: toIsoString(userMsg.timestamp),
						messageType: "aside",
						asideThreadId: threadId,
					},
				],
			});

			const context = this.buildAsideContext(question);
			const result = await this.streamAsideResponse(threadId, context);
			if (result) {
				await this.logAsideUsage(result.usage);
				await this.checkQuotaWarning();
			}
		} catch (error) {
			this.logger.error(
				{ sessionId: this.session.id, threadId, error },
				"Error aside",
			);
		} finally {
			this.isProcessing = false;
			this.activeAsideThreadId = null;
		}
	}

	handleAsideCancel(threadId: string): void {
		if (this.activeAsideThreadId === threadId && this.activeAsideController) {
			this.activeAsideController.abort();
		}
	}

	private buildAsideContext(question: string): LLMMessage[] {
		return [
			...this.session.messages
				.filter((m) => m.messageType === "main" || m.messageType === null)
				.map((m) => ({
					role: m.role === "user" ? ("user" as const) : ("assistant" as const),
					content: m.content,
				})),
			{ role: "user" as const, content: `[ASIDE QUESTION]: ${question}` },
		];
	}

	private async streamAsideResponse(
		threadId: string,
		context: LLMMessage[],
	): Promise<{
		content: string;
		messageId: string | number;
		usage: TokenUsage;
	} | null> {
		const scenario = this.session.scenario;
		const modelString = resolveConfiguredModel(
			scenario?.coachModel ?? DEFAULT_MODEL,
		);
		const systemPrompt =
			(scenario?.coachSystemPrompt ?? this.session.customCoachPrompt ?? "") +
			ASIDE_INSTRUCTIONS;

		let fullContent = "";
		let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

		this.logger.info(
			{ sessionId: this.session.id, threadId, model: modelString },
			"[aside] Starting aside stream",
		);

		try {
			for await (const chunk of streamCompletion(modelString, {
				systemPrompt,
				messages: context,
				maxTokens: 1024,
				signal: this.activeAsideController?.signal,
			})) {
				if (chunk.type === "delta" && chunk.content) {
					fullContent += chunk.content;
					send(this.ws, {
						type: "aside:delta",
						threadId,
						content: chunk.content,
					});
					broadcast(this.session.id, {
						type: "aside:delta",
						threadId,
						content: chunk.content,
					});
				} else if (chunk.type === "done" && chunk.usage) {
					usage = chunk.usage;
					this.logger.info(
						{
							sessionId: this.session.id,
							threadId,
							model: modelString,
							inputTokens: chunk.usage.inputTokens,
							outputTokens: chunk.usage.outputTokens,
							contentLength: fullContent.length,
						},
						"[aside] Aside stream done",
					);
				} else if (chunk.type === "error" && chunk.error) {
					this.logger.warn(
						{
							sessionId: this.session.id,
							threadId,
							errorCode: chunk.error.code,
							errorMsg: chunk.error.message,
						},
						"[aside] Chunk error",
					);
				}
			}

			if (fullContent.trim().length === 0) {
				this.logger.warn(
					{ sessionId: this.session.id, threadId },
					"Aside stream returned empty content",
				);
				send(this.ws, {
					type: "aside:error",
					threadId,
					error: "AI service returned an empty response. Please try again.",
				});
				return null;
			}

			if (isLikelyIncompleteCoachMessage(fullContent)) {
				this.logger.warn(
					{
						sessionId: this.session.id,
						threadId,
						contentPreview: fullContent.trim().slice(0, 120),
					},
					"[aside] Dropping incomplete aside response",
				);
				send(this.ws, {
					type: "aside:error",
					threadId,
					error: "Coach response was cut off. Please try again.",
				});
				return null;
			}

			const message = await this.persistMessage("coach", fullContent.trim(), {
				messageType: "aside",
				asideThreadId: threadId,
			});
			this.session.messages.push(message);
			send(this.ws, {
				type: "aside:done",
				threadId,
				messageId: message.id,
				usage,
			});

			await track(
				this.prisma,
				TelemetryEvents.STREAM_COMPLETED,
				{
					role: "aside",
					model: modelString,
					inputTokens: usage.inputTokens,
					outputTokens: usage.outputTokens,
					contentLength: fullContent.trim().length,
				},
				{
					userId: this.session.userId ?? undefined,
					sessionId: this.session.id,
				},
			);

			return { content: fullContent, messageId: message.id, usage };
		} catch (error) {
			this.logger.error(
				{
					sessionId: this.session.id,
					threadId,
					error,
					errorMsg: errorMessage(error),
				},
				"Aside stream error",
			);
			send(this.ws, {
				type: "aside:error",
				threadId,
				error: "AI service temporarily unavailable.",
			});
			return null;
		}
	}

	private async logAsideUsage(usage: TokenUsage): Promise<void> {
		const coachModel = resolveConfiguredModel(
			this.session.scenario?.coachModel ?? DEFAULT_MODEL,
		);
		await this.prisma.usageLog.create({
			data: {
				sessionId: this.session.id,
				userId: this.session.userId,
				invitationId: this.session.invitationId,
				model: coachModel,
				streamType: "aside",
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
			},
		});
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
