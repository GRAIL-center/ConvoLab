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
import { getInvitationQuotaStatus, type Quota } from '../lib/quota.js';
import { streamCompletion } from '../llm/registry.js';
import type { LLMMessage, TokenUsage } from '../llm/types.js';
import { broadcast } from './broadcaster.js';
import { type HistoryMessage, type ScenarioInfo, send } from './protocol.js';

// Default model for custom scenarios
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

interface SessionWithScenario extends ConversationSession {
  scenario: Scenario | null;
  invitation: Invitation | null;
  messages: Message[];
}

/**
 * Manages a single WebSocket conversation session.
 */
export class ConversationManager {
  private ws: WebSocket;
  private prisma: PrismaClient;
  private session: SessionWithScenario;
  private logger: FastifyBaseLogger;
  private isProcessing = false;

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

  /**
   * Send connection confirmation and message history.
   */
  async initialize(): Promise<void> {
    const scenario = this.session.scenario;

    // Build scenario info - either from predefined scenario or custom fields
    let scenarioInfo: ScenarioInfo;
    if (scenario) {
      scenarioInfo = {
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        partnerPersona: scenario.partnerPersona,
      };
    } else if (this.session.customPartnerPersona) {
      // Custom scenario
      scenarioInfo = {
        id: 0, // Custom scenarios don't have DB ID
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
    }));

    send(this.ws, { type: 'history', messages: historyMessages });
  }

  /**
   * Handle an incoming user message.
   */
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

    // Set flag immediately to prevent race conditions with concurrent messages
    this.isProcessing = true;

    try {
      // Check quota before making LLM calls
      if (this.session.invitationId) {
        const hasQuota = await this.checkQuotaAllowed();
        if (!hasQuota) {
          send(this.ws, { type: 'quota:exhausted' });
          return;
        }
      }

      // 1. Persist user message
      const userMsg = await this.persistMessage('user', content);
      this.session.messages.push(userMsg);

      // Broadcast user message to observers (they don't receive it via WebSocket)
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

      // 2. Stream partner response
      const partnerResult = await this.streamResponse('partner');
      if (!partnerResult) {
        this.isProcessing = false;
        return; // Error already sent
      }

      // 3. Stream coach response (now has partner's response in context)
      const coachResult = await this.streamResponse('coach');
      if (!coachResult) {
        this.isProcessing = false;
        return; // Error already sent
      }

      // 4. Log usage
      await this.logUsage(partnerResult.usage, coachResult.usage);

      // 5. Check quota warning
      await this.checkQuotaWarning();

      // 6. Update session message count
      await this.prisma.conversationSession.update({
        where: { id: this.session.id },
        data: { totalMessages: { increment: 3 } }, // user + partner + coach
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

  /**
   * Handle resume request after reconnection.
   */
  async handleResume(afterMessageId?: number): Promise<void> {
    // Reload messages from DB
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
    }));

    send(this.ws, { type: 'history', messages: historyMessages });
  }

  /**
   * Stream a response from either partner or coach.
   */
  private async streamResponse(
    role: 'partner' | 'coach'
  ): Promise<{ content: string; messageId: number; usage: TokenUsage } | null> {
    const scenario = this.session.scenario;

    // Get model and system prompt - from scenario or custom fields
    let modelString: string;
    let systemPrompt: string;

    if (scenario) {
      modelString = role === 'partner' ? scenario.partnerModel : scenario.coachModel;
      systemPrompt = role === 'partner' ? scenario.partnerSystemPrompt : scenario.coachSystemPrompt;
    } else if (this.session.customPartnerPrompt && this.session.customCoachPrompt) {
      // Custom scenario - use default model
      modelString = DEFAULT_MODEL;
      systemPrompt =
        role === 'partner' ? this.session.customPartnerPrompt : this.session.customCoachPrompt;
    } else {
      throw new Error('Session has neither scenario nor custom prompts');
    }

    // Build context based on role
    const context = this.buildContext(role);

    let fullContent = '';
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    let retries = 0;
    const maxRetries = 2;

    while (retries <= maxRetries) {
      try {
        fullContent = '';

        // Enable web search for partner if scenario has it enabled
        const useWebSearch = role === 'partner' && scenario?.partnerUseWebSearch === true;

        for await (const chunk of streamCompletion(modelString, {
          systemPrompt,
          messages: context,
          maxTokens: 1024,
          useWebSearch,
        })) {
          if (chunk.type === 'delta' && chunk.content) {
            fullContent += chunk.content;
            const deltaType = role === 'partner' ? 'partner:delta' : 'coach:delta';
            send(this.ws, { type: deltaType, content: chunk.content });
            // Broadcast to observers
            broadcast(this.session.id, { type: deltaType, content: chunk.content });
          } else if (chunk.type === 'done' && chunk.usage) {
            usage = chunk.usage;
          } else if (chunk.type === 'error' && chunk.error) {
            if (chunk.error.retryable && retries < maxRetries) {
              retries++;
              await sleep(1000 * retries);
              continue;
            }
            throw new Error(chunk.error.message);
          }
        }

        // Persist the message
        const message = await this.persistMessage(role, fullContent);
        this.session.messages.push(message);

        if (role === 'partner') {
          const doneMsg = { type: 'partner:done' as const, messageId: message.id, usage };
          send(this.ws, doneMsg);
          broadcast(this.session.id, doneMsg);
        } else {
          const doneMsg = { type: 'coach:done' as const, messageId: message.id, usage };
          send(this.ws, doneMsg);
          broadcast(this.session.id, doneMsg);
        }

        return { content: fullContent, messageId: message.id, usage };
      } catch (error) {
        if (retries < maxRetries) {
          retries++;
          await sleep(1000 * retries);
          continue;
        }

        this.logger.error({ sessionId: this.session.id, role, error }, 'Error streaming response');

        // Save partial message if we have content
        if (fullContent.length > 0) {
          await this.persistMessage(role, fullContent, {
            complete: false,
            error: 'PROVIDER_ERROR',
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

    return null;
  }

  /**
   * Build context messages for LLM based on role.
   * Partner sees: user + partner messages (not coach)
   * Coach sees: all messages (user + partner + coach)
   */
  private buildContext(role: 'partner' | 'coach'): LLMMessage[] {
    const messages = this.session.messages;

    if (role === 'partner') {
      // Partner only sees user/partner conversation
      return messages
        .filter((m) => m.role === 'user' || m.role === 'partner')
        .map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        })) as LLMMessage[];
    }

    // Coach sees everything
    // Map: user -> user, partner -> assistant (as context), coach -> assistant
    // Actually, coach needs to see the structure. Let's format it clearly.
    return messages.map((m) => {
      if (m.role === 'user') {
        return { role: 'user' as const, content: m.content };
      }
      // For partner and coach, we show as assistant but with context
      const prefix = m.role === 'partner' ? '[Partner]' : '[Your previous advice]';
      return { role: 'assistant' as const, content: `${prefix} ${m.content}` };
    });
  }

  /**
   * Persist a message to the database.
   */
  private async persistMessage(
    role: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<Message> {
    return this.prisma.message.create({
      data: {
        sessionId: this.session.id,
        role,
        content,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /**
   * Log token usage for both streams.
   */
  private async logUsage(partnerUsage: TokenUsage, coachUsage: TokenUsage): Promise<void> {
    const scenario = this.session.scenario;
    const partnerModel = scenario?.partnerModel ?? DEFAULT_MODEL;
    const coachModel = scenario?.coachModel ?? DEFAULT_MODEL;

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

  /**
   * Check if quota allows more usage.
   */
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

  /**
   * Check quota and send warning if low.
   */
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
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
