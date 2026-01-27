import type {
    ConversationSession,
    Invitation,
    Message,
    Prisma,
    PrismaClient,
    Scenario,
} from '@workspace/database';
import type { FastifyBaseLogger } from 'fastify';
import type { WebSocket } from 'ws';
//import { DEFAULT_MODEL } from '../lib/constants.js';
const DEFAULT_MODEL = 'gpt-4o';
import { getInvitationQuotaStatus, type Quota } from '../lib/quota.js';
import { streamCompletion } from '../llm/registry.js';
import type { LLMMessage, TokenUsage } from '../llm/types.js';
import { broadcast } from './broadcaster.js';
import { type HistoryMessage, type ScenarioInfo, send } from './protocol.js';

// Default models for custom scenarios
const DEFAULT_PARTNER_MODEL = 'google:gemini-2.0-flash';
const DEFAULT_COACH_MODEL = 'claude-3-5-sonnet-20241022';
const FALLBACK_PARTNER_MODEL = 'claude-3-5-sonnet-20241022';

const ASIDE_INSTRUCTIONS = `
When responding to an aside question (marked with [ASIDE QUESTION]):
- You are stepping out of the main coaching flow to answer a specific question
- Reference specific parts of the conversation when relevant
- Keep responses focused and concise
- Do not continue the main coaching narrative
`;

// Added missing fields to the interface to resolve TS2339 and TS2551
interface SessionWithScenario extends ConversationSession {
    scenario: Scenario | null;
    invitation: Invitation | null;
    messages: Message[];
    invitationId: string | null;
    userId: string;
    customPartnerPersona: string | null;
    customScenarioName: string | null;
    customDescription: string | null;
    customPartnerPrompt: string | null;
    customCoachPrompt: string | null;
}

export class ConversationManager {
    private ws: WebSocket;
    private prisma: PrismaClient;
    private session: SessionWithScenario;
    private logger: FastifyBaseLogger;
    private isProcessing = false;
    private activeAsideController: AbortController | null = null;
    private activeAsideThreadId: string | null = null;

    constructor(
        ws: WebSocket,
        prisma: PrismaClient,
        session: SessionWithScenario,
        logger: FastifyBaseLogger
    ) {
        this.ws = ws;
        this.prisma = prisma;
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
                name: this.session.customScenarioName ?? 'Custom Scenario',
                description: this.session.customDescription ?? 'User-defined conversation partner',
                partnerPersona: this.session.customPartnerPersona,
                isCustom: true,
            };
        } else {
            throw new Error('Session has neither scenario nor custom prompts');
        }

        send(this.ws, { type: 'connected', sessionId: this.session.id, scenario: scenarioInfo });

        const historyMessages: HistoryMessage[] = this.session.messages.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'partner' | 'coach',
            content: m.content,
            timestamp: m.timestamp.toISOString(),
            messageType: (m.messageType as 'main' | 'aside') ?? 'main',
            asideThreadId: m.asideThreadId ?? undefined,
        }));

        send(this.ws, { type: 'history', messages: historyMessages });
    }

    async handleUserMessage(content: string): Promise<void> {
        if (this.isProcessing) {
            send(this.ws, {
                type: 'error',
                code: 'RATE_LIMITED',
                message: 'Please wait for the current response to complete',
                recoverable: true,
            });
            return;
        }

        this.isProcessing = true;

        try {
            if (this.session.invitationId) {
                const hasQuota = await this.checkQuotaAllowed();
                if (!hasQuota) {
                    send(this.ws, { type: 'quota:exhausted' });
                    return;
                }
            }

            const userMsg = await this.persistMessage('user', content);
            this.session.messages.push(userMsg);

            broadcast(this.session.id, {
                type: 'history',
                messages: [
                    {
                        id: userMsg.id,
                        role: 'user',
                        content: userMsg.content,
                        timestamp: userMsg.timestamp.toISOString(),
                    },
                ],
            });

            const partnerResult = await this.streamResponse('partner');
            if (!partnerResult) {
                this.isProcessing = false;
                return;
            }

            const coachResult = await this.streamResponse('coach');
            if (!coachResult) {
                this.isProcessing = false;
                return;
            }

            await this.logUsage(partnerResult.usage, coachResult.usage);
            await this.checkQuotaWarning();

            await this.prisma.conversationSession.update({
                where: { id: this.session.id },
                data: { totalMessages: { increment: 3 } },
            });
        } catch (error) {
            this.logger.error({ sessionId: this.session.id, error }, 'Error handling user message');
            send(this.ws, {
                type: 'error',
                code: 'INTERNAL_ERROR',
                message: 'An unexpected error occurred',
                recoverable: true,
            });
        } finally {
            this.isProcessing = false;
        }
    }

    async handleResume(afterMessageId?: number): Promise<void> {
        const messages = await this.prisma.message.findMany({
            where: {
                sessionId: this.session.id,
                ...(afterMessageId ? { id: { gt: afterMessageId } } : {}),
            },
            orderBy: { id: 'asc' },
        });

        const historyMessages: HistoryMessage[] = messages.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'partner' | 'coach',
            content: m.content,
            timestamp: m.timestamp.toISOString(),
            messageType: (m.messageType as 'main' | 'aside') ?? 'main',
            asideThreadId: m.asideThreadId ?? undefined,
        }));

        send(this.ws, { type: 'history', messages: historyMessages });
    }

    private async streamResponse(
        role: 'partner' | 'coach'
    ): Promise<{ content: string; messageId: number; usage: TokenUsage } | null> {
        const scenario = this.session.scenario;

        let modelString: string;
        let systemPrompt: string;

        if (scenario) {
            modelString = role === 'partner' ? scenario.partnerModel : scenario.coachModel;
            systemPrompt = role === 'partner' ? scenario.partnerSystemPrompt : scenario.coachSystemPrompt;
        } else if (this.session.customPartnerPrompt && this.session.customCoachPrompt) {
            modelString = role === 'partner' ? DEFAULT_PARTNER_MODEL : DEFAULT_COACH_MODEL;
            systemPrompt =
                role === 'partner' ? this.session.customPartnerPrompt : this.session.customCoachPrompt;
        } else {
            throw new Error('Session has neither scenario nor custom prompts');
        }

        if (role === 'partner') {
            systemPrompt +=
                '\n\nIMPORTANT: Keep your responses SHORT - 1-3 sentences maximum.';
        }

        const context = this.buildContext(role);
        return await this.tryStreamWithFallback(role, modelString, systemPrompt, context);
    }

    private async tryStreamWithFallback(
        role: 'partner' | 'coach',
        modelString: string,
        systemPrompt: string,
        context: LLMMessage[]
    ): Promise<{ content: string; messageId: number; usage: TokenUsage } | null> {
        const isGeminiModel = modelString.startsWith('google:') || modelString.includes('gemini');
        let currentModel = modelString;
        let useWebSearch = role === 'partner' && isGeminiModel;
        let usedFallback = false;

        for (let attempt = 0; attempt < 2; attempt++) {
            let fullContent = '';
            let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
            let retries = 0;
            const maxRetries = 2;

            while (retries <= maxRetries) {
                try {
                    fullContent = '';
                    const maxTokens = 1024;

                    for await (const chunk of streamCompletion(currentModel, {
                        systemPrompt,
                        messages: context,
                        maxTokens,
                        useWebSearch,
                    })) {
                        if (chunk.type === 'delta' && chunk.content) {
                            fullContent += chunk.content;
                            const deltaType = role === 'partner' ? 'partner:delta' : 'coach:delta';
                            send(this.ws, { type: deltaType, content: chunk.content });
                            broadcast(this.session.id, { type: deltaType, content: chunk.content });
                        } else if (chunk.type === 'done' && chunk.usage) {
                            usage = chunk.usage;
                        } else if (chunk.type === 'error' && chunk.error) {
                            const isQuotaError = chunk.error.code === 'HTTP_429' || chunk.error.message?.includes('quota');
                            if (isGeminiModel && isQuotaError && !usedFallback) {
                                currentModel = FALLBACK_PARTNER_MODEL;
                                useWebSearch = false;
                                usedFallback = true;
                                break;
                            }
                            if (chunk.error.retryable && retries < maxRetries) {
                                retries++;
                                await sleep(1000 * retries);
                                continue;
                            }
                            throw new Error(chunk.error.message);
                        }
                    }

                    if (usedFallback && attempt === 0) continue;

                    const message = await this.persistMessage(role, fullContent.trim());
                    this.session.messages.push(message);

                    const doneType = role === 'partner' ? 'partner:done' : 'coach:done';
                    const doneMsg = { type: doneType as any, messageId: message.id, usage };
                    send(this.ws, doneMsg);
                    broadcast(this.session.id, doneMsg);

                    return { content: fullContent, messageId: message.id, usage };
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    if (isGeminiModel && (errorMsg.includes('429') || errorMsg.includes('quota')) && !usedFallback) {
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
                    if (fullContent.length > 0) {
                        await this.persistMessage(role, fullContent, {
                            metadata: {
                                complete: false,
                                error: 'PROVIDER_ERROR',
                            }
                        });
                    }

                    send(this.ws, {
                        type: 'error',
                        code: 'PROVIDER_ERROR',
                        message: 'AI service temporarily unavailable',
                        recoverable: true,
                    });
                    return null;
                }
            }
        }
        return null;
    }

    private buildContext(role: 'partner' | 'coach'): LLMMessage[] {
        const messages = this.session.messages;
        if (role === 'partner') {
            return messages
                .filter((m) => m.role === 'user' || m.role === 'partner')
                .map((m) => ({
                    role: m.role === 'user' ? 'user' : 'assistant',
                    content: m.content.trim(),
                })) as LLMMessage[];
        }
        return messages.map((m) => {
            if (m.role === 'user') return { role: 'user' as const, content: m.content.trim() };
            const prefix = m.role === 'partner' ? '[Partner]' : '[Your previous advice]';
            return { role: 'assistant' as const, content: `${prefix} ${m.content.trim()}` };
        });
    }

    private async persistMessage(
        role: string,
        content: string,
        options?: {
            metadata?: Record<string, unknown>;
            messageType?: 'main' | 'aside';
            asideThreadId?: string;
        }
    ): Promise<Message> {
        return this.prisma.message.create({
            data: {
                sessionId: this.session.id,
                role,
                content,
                metadata: options?.metadata as Prisma.InputJsonValue | undefined,
                messageType: options?.messageType ?? 'main',
                asideThreadId: options?.asideThreadId,
            },
        });
    }

    private async logUsage(partnerUsage: TokenUsage, coachUsage: TokenUsage): Promise<void> {
        const scenario = this.session.scenario;
        const partnerModel = scenario?.partnerModel ?? DEFAULT_PARTNER_MODEL;
        const coachModel = scenario?.coachModel ?? DEFAULT_COACH_MODEL;

        await this.prisma.usageLog.createMany({
            data: [
                {
                    sessionId: this.session.id,
                    userId: this.session.userId,
                    invitationId: this.session.invitationId,
                    model: partnerModel,
                    streamType: 'partner',
                    inputTokens: partnerUsage.inputTokens,
                    outputTokens: partnerUsage.outputTokens,
                },
                {
                    sessionId: this.session.id,
                    userId: this.session.userId,
                    invitationId: this.session.invitationId,
                    model: coachModel,
                    streamType: 'coach',
                    inputTokens: coachUsage.inputTokens,
                    outputTokens: coachUsage.outputTokens,
                },
            ],
        });
    }

    private async checkQuotaAllowed(): Promise<boolean> {
        if (!this.session.invitationId) return true;
        const invitation = await this.prisma.invitation.findUnique({
            where: { id: this.session.invitationId },
        });
        if (!invitation) return false;
        const quota = invitation.quota as unknown as Quota;
        const status = await getInvitationQuotaStatus(this.prisma, invitation.id, quota);
        return status.allowed;
    }

    private async checkQuotaWarning(): Promise<void> {
        if (!this.session.invitationId) return;
        const invitation = await this.prisma.invitation.findUnique({
            where: { id: this.session.invitationId },
        });
        if (!invitation) return;
        const quota = invitation.quota as unknown as Quota;
        if (!quota?.tokens) return;
        const status = await getInvitationQuotaStatus(this.prisma, invitation.id, quota);
        if (!status.allowed) {
            send(this.ws, { type: 'quota:exhausted' });
        } else if (status.remaining < quota.tokens * 0.2) {
            send(this.ws, {
                type: 'quota:warning',
                remaining: status.remaining,
                total: status.total,
            });
        }
    }

    async handleAsideStart(threadId: string, question: string): Promise<void> {
        if (this.isProcessing || this.activeAsideThreadId) {
            send(this.ws, { type: 'aside:error', threadId, error: 'Response in progress' });
            return;
        }
        this.isProcessing = true;
        this.activeAsideThreadId = threadId;
        this.activeAsideController = new AbortController();

        try {
            const userMsg = await this.persistMessage('user', question, {
                messageType: 'aside',
                asideThreadId: threadId,
            });
            this.session.messages.push(userMsg);
            broadcast(this.session.id, {
                type: 'history',
                messages: [{
                    id: userMsg.id,
                    role: 'user',
                    content: userMsg.content,
                    timestamp: userMsg.timestamp.toISOString(),
                    messageType: 'aside',
                    asideThreadId: threadId,
                }],
            });

            const context = this.buildAsideContext(question);
            const result = await this.streamAsideResponse(threadId, context);
            if (result) {
                await this.logAsideUsage(result.usage);
                await this.checkQuotaWarning();
            }
        } catch (error) {
            this.logger.error({ sessionId: this.session.id, threadId, error }, 'Error aside');
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
                .filter((m) => m.messageType === 'main' || m.messageType === null)
                .map((m) => ({
                    role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
                    content: m.content,
                })),
            { role: 'user' as const, content: `[ASIDE QUESTION]: ${question}` }
        ];
    }

    private async streamAsideResponse(
        threadId: string,
        context: LLMMessage[]
    ): Promise<{ content: string; messageId: number; usage: TokenUsage } | null> {
        const scenario = this.session.scenario;
        let modelString = scenario?.coachModel ?? DEFAULT_MODEL;
        let systemPrompt = (scenario?.coachSystemPrompt ?? this.session.customCoachPrompt ?? '') + ASIDE_INSTRUCTIONS;

        let fullContent = '';
        let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

        try {
            for await (const chunk of streamCompletion(modelString, {
                systemPrompt,
                messages: context,
                maxTokens: 1024,
                signal: this.activeAsideController?.signal,
            })) {
                if (chunk.type === 'delta' && chunk.content) {
                    fullContent += chunk.content;
                    send(this.ws, { type: 'aside:delta', threadId, content: chunk.content });
                    broadcast(this.session.id, { type: 'aside:delta', threadId, content: chunk.content });
                } else if (chunk.type === 'done' && chunk.usage) {
                    usage = chunk.usage;
                }
            }
            const message = await this.persistMessage('coach', fullContent, {
                messageType: 'aside',
                asideThreadId: threadId,
            });
            this.session.messages.push(message);
            send(this.ws, { type: 'aside:done', threadId, messageId: message.id, usage });
            return { content: fullContent, messageId: message.id, usage };
        } catch (error) {
            return null;
        }
    }

    private async logAsideUsage(usage: TokenUsage): Promise<void> {
        const coachModel = this.session.scenario?.coachModel ?? DEFAULT_MODEL;
        await this.prisma.usageLog.create({
            data: {
                sessionId: this.session.id,
                userId: this.session.userId,
                invitationId: this.session.invitationId,
                model: coachModel,
                streamType: 'aside',
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
            },
        });
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}