import * as Sentry from '@sentry/node';
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
const DEFAULT_COACH_MODEL = 'claude-sonnet-4-20250514';
const FALLBACK_PARTNER_MODEL = 'claude-sonnet-4-20250514';

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
  userId: string | null;
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

    // Replay persisted LAPP scores so the panel restores on re-open
    const existingScores = await this.prisma.lappScore.findMany({
      where: { sessionId: this.session.id },
      orderBy: { turnNumber: 'asc' },
    });
    for (const score of existingScores) {
      const validTones = ['constructive', 'warm', 'neutral', 'tense'] as const;
      const tone = validTones.includes(score.tone as (typeof validTones)[number])
        ? (score.tone as (typeof validTones)[number])
        : ('neutral' as const);
      send(this.ws, {
        type: 'score:update',
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

      // Skip coach on the first exchange — let the user form their own response first.
      const isFirstExchange = this.session.messages.filter((m) => m.role === 'user').length === 1;

      if (isFirstExchange) {
        send(this.ws, { type: 'exchange:complete' });
        await this.logUsage(partnerResult.usage, null);
        await this.checkQuotaWarning();
        await this.prisma.conversationSession.update({
          where: { id: this.session.id },
          data: { totalMessages: { increment: 2 } },
        });
      } else {
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

        // Fire-and-forget LAPP scorer (does not block the next exchange)
        const turnNumber = this.session.messages.filter((m) => m.role === 'user').length;
        this.runLappScorer(userMsg.id, content, partnerResult.content, turnNumber).catch(() => {});
      }
    } catch (error) {
      this.logger.error({ sessionId: this.session.id, error }, 'Error handling user message');
      Sentry.captureException(error, { extra: { sessionId: this.session.id } });
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
      systemPrompt += '\n\nIMPORTANT: Keep your responses SHORT - 1-3 sentences maximum.';
    }

    const context = this.buildContext(role);
    const useWebSearch =
      role === 'partner'
        ? (this.session.scenario?.partnerUseWebSearch ?? false)
        : (this.session.scenario?.coachUseWebSearch ?? false);
    return await this.tryStreamWithFallback(role, modelString, systemPrompt, context, useWebSearch);
  }

  private async tryStreamWithFallback(
    role: 'partner' | 'coach',
    modelString: string,
    systemPrompt: string,
    context: LLMMessage[],
    useWebSearch = false
  ): Promise<{ content: string; messageId: number; usage: TokenUsage } | null> {
    const isGeminiModel = modelString.startsWith('google:') || modelString.includes('gemini');
    let currentModel = modelString;
    let usedFallback = false;

    for (let attempt = 0; attempt < 2; attempt++) {
      // On fallback attempt, signal frontend to clear partial content from first attempt
      if (attempt === 1 && role === 'partner') {
        send(this.ws, { type: 'partner:retry' });
      }
      let fullContent = '';
      let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
      let retries = 0;
      const maxRetries = 2;

      while (retries <= maxRetries) {
        try {
          fullContent = '';
          const maxTokens = 1024;

          this.logger.info(
            { sessionId: this.session.id, role, model: currentModel, attempt, retries },
            '[stream] Starting LLM stream'
          );

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
              this.logger.info(
                {
                  sessionId: this.session.id,
                  role,
                  model: currentModel,
                  inputTokens: chunk.usage.inputTokens,
                  outputTokens: chunk.usage.outputTokens,
                  contentLength: fullContent.length,
                },
                '[stream] LLM stream done'
              );
            } else if (chunk.type === 'error' && chunk.error) {
              this.logger.warn(
                {
                  sessionId: this.session.id,
                  role,
                  model: currentModel,
                  errorCode: chunk.error.code,
                  errorMsg: chunk.error.message,
                  retryable: chunk.error.retryable,
                },
                '[stream] LLM chunk error'
              );
              const isQuotaError =
                chunk.error.code === 'HTTP_429' || chunk.error.message?.includes('quota');
              if (isGeminiModel && isQuotaError && !usedFallback) {
                this.logger.info(
                  { sessionId: this.session.id, role, fallbackModel: FALLBACK_PARTNER_MODEL },
                  '[stream] Quota error — switching to fallback model'
                );
                currentModel = FALLBACK_PARTNER_MODEL;
                useWebSearch = false;
                usedFallback = true;
                break;
              }
              if (chunk.error.retryable && retries < maxRetries) {
                retries++;
                this.logger.info(
                  { sessionId: this.session.id, role, model: currentModel, retries },
                  '[stream] Retryable error — retrying'
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
              { sessionId: this.session.id, role, model: currentModel, attempt, retries },
              '[stream] LLM stream completed with empty content'
            );
            // If Gemini returned empty and we haven't tried the fallback yet, switch to Claude
            if (isGeminiModel && !usedFallback) {
              this.logger.info(
                { sessionId: this.session.id, role, fallbackModel: FALLBACK_PARTNER_MODEL },
                '[stream] Empty response from Gemini — switching to fallback model'
              );
              currentModel = FALLBACK_PARTNER_MODEL;
              useWebSearch = false;
              usedFallback = true;
              break; // break while loop so for loop advances to attempt=1
            }
            send(this.ws, {
              type: 'error',
              code: 'PROVIDER_ERROR',
              message: 'AI service returned an empty response. Please try again.',
              recoverable: true,
            });
            return null;
          }

          const message = await this.persistMessage(role, fullContent.trim());
          this.session.messages.push(message);

          this.logger.info(
            { sessionId: this.session.id, role, model: currentModel, messageId: message.id, contentLength: fullContent.trim().length },
            '[stream] Response persisted and sent'
          );

          const doneType = role === 'partner' ? 'partner:done' : 'coach:done';
          // Fix lint: noExplicitAny
          const doneMsg = {
            type: doneType as 'partner:done' | 'coach:done',
            messageId: message.id,
            usage,
            content: fullContent.trim(),
          };
          send(this.ws, doneMsg);
          broadcast(this.session.id, doneMsg);

          return { content: fullContent, messageId: message.id, usage };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          this.logger.error(
            { sessionId: this.session.id, role, model: currentModel, attempt, retries, errorMsg },
            '[stream] Provider error in tryStreamWithFallback'
          );
          Sentry.captureException(error, {
            extra: { sessionId: this.session.id, role, model: currentModel, attempt, retries },
          });
          if (
            isGeminiModel &&
            (errorMsg.includes('429') || errorMsg.includes('quota')) &&
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
          if (fullContent.length > 0) {
            await this.persistMessage(role, fullContent, {
              metadata: {
                complete: false,
                error: 'PROVIDER_ERROR',
              },
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

  private async runLappScorer(
    userMessageId: number,
    userMessage: string,
    partnerMessage: string,
    turnNumber: number
  ): Promise<void> {
    const scorerModel = 'claude-haiku-4-5-20251001';
    const systemPrompt = `You are a LAPP dialogue scoring system. Score the user message on four dimensions and classify its tone. Respond ONLY with valid JSON — no explanation, no markdown, no other text.`;

    const userPrompt = `Turn number: ${turnNumber}

Partner's previous message:
"${partnerMessage.trim()}"

User's message to score:
"${userMessage.trim()}"

Score each dimension 1–5:
L (Listen): Does the response engage with what the partner said, including emotional register?
  1=Ignores/misrepresents  2=Minimal/selective  3=Surface only  4=Main point+tone  5=Full content+emotional subtext

A (Acknowledge): Does the user validate the partner's experience without necessarily agreeing?
  1=Dismisses/mocks  2=Performative ("I hear you, but")  3=Brief/formulaic  4=Clear validation  5=Names specific experience, no adversative

P (Pivot): Does the user redirect toward open-ended inquiry?
  1=No pivot/escalates  2=Rhetorical/leading  3=Abrupt or leading  4=Open, slightly leading OK  5=Genuinely open inquiry

Pe (Perspective): Does the user share their own view in a personal, non-absolutist way?
  1=Lectures/attacks  2=Opinion as fact  3=Stated but impersonal  4=First-person, mostly hedged  5=Personal, hedged, inviting

Tone:
  "tense"=escalatory/adversarial  "neutral"=matter-of-fact  "warm"=acknowledging/curious  "constructive"=full LAPP, collaborative

Note: In turns 1–2, if P or Pe are clearly absent, score them 0 (N/A).

Return ONLY this JSON: {"l":N,"a":N,"p":N,"pe":N,"tone":"X"}`;

    let fullContent = '';
    try {
      for await (const chunk of streamCompletion(scorerModel, {
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 80,
      })) {
        if (chunk.type === 'delta' && chunk.content) {
          fullContent += chunk.content;
        }
      }

      // Extract JSON from response (handle any wrapping text)
      const jsonMatch = fullContent.match(/\{[^}]+\}/);
      if (!jsonMatch) return;

      const parsed = JSON.parse(jsonMatch[0]) as {
        l: number;
        a: number;
        p: number;
        pe: number;
        tone: string;
      };

      const validTones = ['constructive', 'warm', 'neutral', 'tense'] as const;
      const tone = validTones.includes(parsed.tone as (typeof validTones)[number])
        ? (parsed.tone as (typeof validTones)[number])
        : 'neutral';

      const scores = {
        l: Math.min(5, Math.max(0, Math.round(parsed.l))),
        a: Math.min(5, Math.max(0, Math.round(parsed.a))),
        p: Math.min(5, Math.max(0, Math.round(parsed.p))),
        pe: Math.min(5, Math.max(0, Math.round(parsed.pe))),
      };

      await this.prisma.lappScore.upsert({
        where: { userMessageId },
        create: { userMessageId, sessionId: this.session.id, turnNumber, ...scores, tone },
        update: { ...scores, tone },
      });

      send(this.ws, { type: 'score:update', userMessageId, turnNumber, scores, tone });
    } catch {
      // Scoring failure is non-critical — silently ignore
    }
  }

  private buildContext(role: 'partner' | 'coach'): LLMMessage[] {
    const messages = this.session.messages;
    if (role === 'partner') {
      return messages
        .filter((m) => (m.role === 'user' || m.role === 'partner') && m.content.trim().length > 0)
        .map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
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
      if (m.role === 'user') {
        const exchange: Exchange = { user: m.content.trim(), partner: '' };
        i++;
        if (i < messages.length && messages[i].role === 'partner') {
          exchange.partner = messages[i].content.trim();
          i++;
        }
        if (i < messages.length && messages[i].role === 'coach') {
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
      const userContent = isLast
        ? `The user said: "${ex.user}"\nThe uncle responded: "${ex.partner}"`
        : `The user said: "${ex.user}"\nThe uncle responded: "${ex.partner}"`;
      result.push({ role: 'user' as const, content: userContent });
      if (ex.coach) {
        result.push({ role: 'assistant' as const, content: ex.coach });
      } else if (!isLast) {
        // First exchange had no coach — insert placeholder to maintain alternation
        result.push({
          role: 'assistant' as const,
          content: '[No feedback given for this exchange]',
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

  private async logUsage(partnerUsage: TokenUsage, coachUsage: TokenUsage | null): Promise<void> {
    const scenario = this.session.scenario;
    const partnerModel = scenario?.partnerModel ?? DEFAULT_PARTNER_MODEL;
    const coachModel = scenario?.coachModel ?? DEFAULT_COACH_MODEL;

    const partnerEntry = {
      sessionId: this.session.id,
      userId: this.session.userId,
      invitationId: this.session.invitationId,
      model: partnerModel,
      streamType: 'partner',
      inputTokens: partnerUsage.inputTokens,
      outputTokens: partnerUsage.outputTokens,
    };

    if (!coachUsage) {
      await this.prisma.usageLog.create({ data: partnerEntry });
      return;
    }

    await this.prisma.usageLog.createMany({
      data: [
        partnerEntry,
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
        messages: [
          {
            id: userMsg.id,
            role: 'user',
            content: userMsg.content,
            timestamp: userMsg.timestamp.toISOString(),
            messageType: 'aside',
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
      { role: 'user' as const, content: `[ASIDE QUESTION]: ${question}` },
    ];
  }

  private async streamAsideResponse(
    threadId: string,
    context: LLMMessage[]
  ): Promise<{ content: string; messageId: number; usage: TokenUsage } | null> {
    const scenario = this.session.scenario;
    const modelString = scenario?.coachModel ?? DEFAULT_MODEL;
    const systemPrompt =
      (scenario?.coachSystemPrompt ?? this.session.customCoachPrompt ?? '') + ASIDE_INSTRUCTIONS;

    let fullContent = '';
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

    this.logger.info(
      { sessionId: this.session.id, threadId, model: modelString },
      '[aside] Starting aside stream'
    );

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
          this.logger.info(
            {
              sessionId: this.session.id,
              threadId,
              model: modelString,
              inputTokens: chunk.usage.inputTokens,
              outputTokens: chunk.usage.outputTokens,
              contentLength: fullContent.length,
            },
            '[aside] Aside stream done'
          );
        } else if (chunk.type === 'error' && chunk.error) {
          this.logger.warn(
            { sessionId: this.session.id, threadId, errorCode: chunk.error.code, errorMsg: chunk.error.message },
            '[aside] Chunk error'
          );
        }
      }

      if (fullContent.trim().length === 0) {
        this.logger.warn({ sessionId: this.session.id, threadId }, 'Aside stream returned empty content');
        send(this.ws, { type: 'aside:error', threadId, error: 'AI service returned an empty response. Please try again.' });
        return null;
      }

      const message = await this.persistMessage('coach', fullContent.trim(), {
        messageType: 'aside',
        asideThreadId: threadId,
      });
      this.session.messages.push(message);
      send(this.ws, { type: 'aside:done', threadId, messageId: message.id, usage });
      return { content: fullContent, messageId: message.id, usage };
    } catch (error) {
      this.logger.error({ sessionId: this.session.id, threadId, error }, 'Aside stream error');
      send(this.ws, { type: 'aside:error', threadId, error: 'AI service temporarily unavailable.' });
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
