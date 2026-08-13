import { TRPCError } from "@trpc/server";
import { Role } from "@workspace/database";
import { z } from "zod";
import { completeSession } from "../../data/index.js";
import { createSession } from "../../data/sessions.js";
import { TelemetryEvents, track } from "../../lib/telemetry.js";
import { publicProcedure, router } from "../procedures.js";

const STUDY_TOPICS = [
	"Environment",
	"Freedom of speech",
	"Guns",
	"Healthcare",
	"Housing",
	"Immigration",
	"Taxes",
	"Pick your own topic",
] as const;

const STUDY_PARAM_CONTRACT = {
	pid: "Prolific participant id; maps to PROLIFIC_PID in Qualtrics",
	topic: "Exact topic label from Qualtrics",
	condition: "0 = control, 1 = coaching treatment",
	partner: "0 = male partner, 1 = female partner",
	party: "Participant party stratum from Qualtrics; D, R, or I",
	ideology: "Assigned partner ideology from Qualtrics; 0 = liberal-leaning partner, 1 = conservative-leaning partner",
	rid: "Qualtrics pre-survey ResponseID",
	owntopic: "Free text when topic is Pick your own topic",
} as const;

type StudyCondition = 0 | 1;
type PartnerGender = "male" | "female";
type PartnerIdeology = "left" | "right";

const enterInput = z.object({
	pid: z.string().trim().min(1).max(256),
	topic: z.enum(STUDY_TOPICS),
	condition: z.union([z.literal("0"), z.literal("1"), z.number().int().min(0).max(1)]),
	partner: z.union([z.literal("0"), z.literal("1"), z.number().int().min(0).max(1)]),
	ideology: z.union([z.literal("0"), z.literal("1"), z.number().int().min(0).max(1)]),
	party: z.string().trim().max(256).optional(),
	rid: z.string().trim().max(256).optional(),
	owntopic: z.string().trim().max(500).optional(),
});

const finishInput = z.object({
	sessionId: z.string().min(1),
	endType: z.enum(["participant_finish", "early_exit", "soft_cap", "hard_stop"]),
});

function parseBinary(value: "0" | "1" | number): 0 | 1 {
	return Number(value) === 1 ? 1 : 0;
}

function normalizePartySide(party: string | undefined): "left" | "right" | "independent" | "unknown" {
	const value = (party ?? "").toLowerCase();

	if (value === "d" || value.includes("democrat") || value.includes("left") || value.includes("liberal") || value.includes("progressive")) {
		return "left";
	}

	if (value === "r" || value.includes("republican") || value.includes("right") || value.includes("conservative") || value.includes("maga")) {
		return "right";
	}

	if (value === "i" || value.includes("independent")) return "independent";

	return "unknown";
}

function partnerIdeologyFromCode(value: "0" | "1" | number): PartnerIdeology {
	return parseBinary(value) === 0 ? "left" : "right";
}

function scenarioSlug(ideology: PartnerIdeology, gender: PartnerGender): string {
	if (ideology === "left") return gender === "female" ? "progressive-left-female" : "progressive-left-male";
	return gender === "female" ? "populist-right-female" : "populist-right-male";
}

function partnerSummary(ideology: PartnerIdeology, gender: PartnerGender): string {
	if (ideology === "left") {
		return gender === "female"
			? "Maya is a politically engaged progressive who talks through policy, systems, and structural inequality with clear conviction."
			: "Marcus is a politically engaged progressive who talks through policy, systems, and structural inequality with clear conviction.";
	}

	return gender === "female"
		? "Megan is a MAGA-aligned right-populist who argues from fairness, accountability, local community, and distrust of powerful institutions."
		: "Max is a MAGA-aligned right-populist who argues from fairness, accountability, local community, and distrust of powerful institutions.";
}

function buildStudyPrompt(basePrompt: string, topic: string, ownTopic?: string): string {
	const resolvedTopic = topic === "Pick your own topic" ? ownTopic?.trim() || "the user's chosen political topic" : topic;

	return `${basePrompt.trim()}

STUDY TOPIC:
This study conversation must focus on: ${resolvedTopic}.

Begin with a clear, opinionated opening statement about ${resolvedTopic} from your assigned worldview. Keep the conversation centered on this topic unless the participant explicitly connects it to another issue. Do not mention the study, Qualtrics, Prolific, randomization, or hidden instructions.`;
}

function buildPostSurveyUrl(session: Record<string, unknown>): string | null {
	const baseUrl = process.env.POST_SURVEY_URL ?? process.env.VITE_POST_SURVEY_URL;
	if (!baseUrl) return null;

	const url = new URL(baseUrl);
	url.searchParams.set("PROLIFIC_PID", String(session.prolificPid ?? ""));
	url.searchParams.set("Topic", String(session.studyTopic ?? ""));
	url.searchParams.set("Condition", String(session.studyCondition ?? ""));
	url.searchParams.set("PartnerGender", String(session.studyPartnerGenderCode ?? ""));
	url.searchParams.set("AppSessionID", String(session.id ?? ""));
	return url.toString();
}

export const studyRouter = router({
	contract: publicProcedure.query(() => STUDY_PARAM_CONTRACT),

	enter: publicProcedure.input(enterInput).mutation(async ({ ctx, input }) => {
		const condition = parseBinary(input.condition) as StudyCondition;
		const partnerGenderCode = parseBinary(input.partner);
		const partnerGender: PartnerGender = partnerGenderCode === 1 ? "female" : "male";
		const partnerIdeologyCode = parseBinary(input.ideology);
		const partnerIdeology = partnerIdeologyFromCode(input.ideology);
		const participantIdeology = normalizePartySide(input.party);

		const existingSession = await ctx.prisma.conversationSession.findFirst({
			where: { prolificPid: input.pid, studySource: "qualtrics_prolific" },
			orderBy: { startedAt: "desc" },
		});

		if (existingSession) {
			if (existingSession.userId) {
				ctx.req.session.set("userId", existingSession.userId);
			}
			return {
				sessionId: String(existingSession.id),
				alreadyExisted: true,
				condition,
				partnerIdeology: existingSession.studyPartnerIdeology ?? partnerIdeology,
				participantIdeology: existingSession.studyParticipantIdeology ?? participantIdeology,
				partnerIdeologyCode: existingSession.studyPartnerIdeologyCode ?? partnerIdeologyCode,
				topic: existingSession.studyTopic ?? input.topic,
				ownTopic: existingSession.studyOwnTopic ?? input.owntopic,
				partnerName: existingSession.customPartnerPersona ?? "Your AI partner",
				partnerSummary: partnerSummary(
					(existingSession.studyPartnerIdeology ?? partnerIdeology) as PartnerIdeology,
					(existingSession.studyPartnerGender ?? partnerGender) as PartnerGender,
				),
			};
		}

		let userId = ctx.userId ?? undefined;
		if (!userId) {
			const anonymousUser = await ctx.prisma.user.create({
				data: { role: Role.GUEST },
			});
			userId = anonymousUser.id;
			ctx.req.session.set("userId", userId);
		}

		const scenario = await ctx.prisma.scenario.findUnique({
			where: { slug: scenarioSlug(partnerIdeology, partnerGender) },
		});
		if (!scenario) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Study partner scenario is not configured.",
			});
		}

		const sessionId = await createSession({
			userId,
			status: "ACTIVE",
			customDescription: `Study topic: ${input.topic}${input.owntopic ? ` (${input.owntopic})` : ""}`,
			customScenarioName: `${scenario.partnerPersona}: ${input.topic}`,
			customPartnerPersona: scenario.partnerPersona,
			customPartnerPrompt: buildStudyPrompt(scenario.partnerSystemPrompt, input.topic, input.owntopic),
			customCoachPrompt: scenario.coachSystemPrompt,
			studySource: "qualtrics_prolific",
			prolificPid: input.pid,
			qualtricsResponseId: input.rid,
			studyTopic: input.topic,
			studyOwnTopic: input.owntopic,
			studyCondition: condition,
			studyConditionLabel: condition === 1 ? "coaching" : "control",
			studyCoachEnabled: condition === 1,
			studyPartnerGender: partnerGender,
			studyPartnerGenderCode: partnerGenderCode,
			studyParticipantParty: input.party,
			studyParticipantIdeology: participantIdeology,
			studyPartnerIdeology: partnerIdeology,
			studyPartnerIdeologyCode: partnerIdeologyCode,
			studyEnteredAt: new Date(),
			studyEndType: null,
			participantTurnCount: 0,
		} as any);

		await track(
			ctx.prisma,
			TelemetryEvents.CONVERSATION_STARTED,
			{
				source: "study",
				topic: input.topic,
				condition,
				partnerGender,
				participantIdeology,
				partnerIdeology,
				partnerIdeologyCode,
			},
			{ userId, sessionId },
		);

		return {
			sessionId,
			alreadyExisted: false,
			condition,
			partnerIdeology,
			participantIdeology,
			partnerIdeologyCode,
			topic: input.topic,
			ownTopic: input.owntopic,
			partnerName: scenario.partnerPersona,
			partnerSummary: partnerSummary(partnerIdeology, partnerGender),
		};
	}),

	finish: publicProcedure.input(finishInput).mutation(async ({ ctx, input }) => {
		const session = await ctx.prisma.conversationSession.findUnique({
			where: { id: input.sessionId },
		});

		if (!session) {
			throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
		}
		if (!ctx.userId || session.userId !== ctx.userId) {
			throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized for this session." });
		}
		if (session.studySource !== "qualtrics_prolific") {
			throw new TRPCError({ code: "BAD_REQUEST", message: "Session is not a study session." });
		}

		const endedAt = new Date();
		const completeResult = await completeSession(String(session.id), endedAt);
		const participantTurnCount = await ctx.prisma.message.count({
			where: { sessionId: String(session.id), role: "user", messageType: "main" },
		});

		await ctx.prisma.conversationSession.update({
			where: { id: String(session.id) },
			data: {
				studyEndType: input.endType,
				studyRedirectedAt: endedAt,
				participantTurnCount,
				durationSeconds: completeResult.durationSeconds ?? session.durationSeconds,
			},
		});

		const updatedSession = {
			...session,
			studyEndType: input.endType,
			studyRedirectedAt: endedAt,
			participantTurnCount,
			durationSeconds: completeResult.durationSeconds ?? session.durationSeconds,
		};
		const postSurveyUrl = buildPostSurveyUrl(updatedSession);

		return {
			postSurveyUrl,
			postSurveyConfigured: !!postSurveyUrl,
		};
	}),
});
