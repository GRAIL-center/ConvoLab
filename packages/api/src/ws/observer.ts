import type { PrismaClient } from '@workspace/database';
import type { FastifyBaseLogger } from 'fastify';
import type { WebSocket } from 'ws';
import { subscribe, unsubscribe } from './broadcaster.js';
import { type HistoryMessage, send } from './protocol.js';

/**
 * Manages a read-only observer connection to a conversation session.
 *
 * Observers (researchers with STAFF+ role) can watch a participant's
 * conversation in real-time without being able to send messages.
 */
export class ObserverManager {
  private ws: WebSocket;
  private prisma: PrismaClient;
  private sessionId: number;
  private logger: FastifyBaseLogger;

  constructor(ws: WebSocket, prisma: PrismaClient, sessionId: number, logger: FastifyBaseLogger) {
    this.ws = ws;
    this.prisma = prisma;
    this.sessionId = sessionId;
    this.logger = logger;
  }

  /**
   * Initialize the observer connection.
   * Sends session info and message history, then subscribes to broadcasts.
   */
  async initialize(): Promise<void> {
    // Load session with scenario and all messages
    const session = await this.prisma.conversationSession.findUnique({
      where: { id: this.sessionId },
      include: {
        scenario: true,
        messages: { orderBy: { id: 'asc' } },
      },
    });

    if (!session) {
      send(this.ws, {
        type: 'error',
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found',
        recoverable: false,
      });
      this.ws.close(1008, 'Session not found');
      return;
    }

    // Build scenario info
    const scenarioInfo = session.scenario
      ? {
          id: session.scenario.id,
          name: session.scenario.name,
          description: session.scenario.description,
          partnerPersona: session.scenario.partnerPersona,
        }
      : {
          id: 0,
          name: 'Custom Scenario',
          description: session.customDescription ?? 'User-defined conversation partner',
          partnerPersona: session.customPartnerPersona ?? 'Custom partner',
          isCustom: true,
        };

    // Send connected message
    send(this.ws, {
      type: 'connected',
      sessionId: this.sessionId,
      scenario: scenarioInfo,
    });

    // Send message history
    const historyMessages: HistoryMessage[] = session.messages.map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'partner' | 'coach',
      content: m.content,
      timestamp: m.timestamp.toISOString(),
    }));

    send(this.ws, { type: 'history', messages: historyMessages });

    // Subscribe to live broadcasts
    subscribe(this.sessionId, this.ws);

    this.logger.info({ sessionId: this.sessionId }, 'Observer subscribed to session');
  }

  /**
   * Clean up when observer disconnects.
   */
  cleanup(): void {
    unsubscribe(this.sessionId, this.ws);
    this.logger.info({ sessionId: this.sessionId }, 'Observer unsubscribed from session');
  }
}

/**
 * Verify a user has STAFF+ role for observing sessions.
 */
export async function verifyObserverAccess(
  prisma: PrismaClient,
  userId: string | undefined
): Promise<{ allowed: boolean; reason?: string }> {
  if (!userId) {
    return { allowed: false, reason: 'Not authenticated' };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }

  if (user.role !== 'ADMIN' && user.role !== 'STAFF') {
    return { allowed: false, reason: 'Insufficient permissions' };
  }

  return { allowed: true };
}
