import type { PrismaClient } from '../db/firestoreHelpers.js';
import { getSession, getMessagesForSession } from '../data/index.js';
import type { FastifyBaseLogger } from 'fastify';
import type { WebSocket } from 'ws';
import { subscribe, unsubscribe } from './broadcaster.js';
import { type HistoryMessage, send } from './protocol.js';

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

/**
 * Manages a read-only observer connection to a conversation session.
 *
 * Observers (researchers with STAFF+ role) can watch a participant's
 * conversation in real-time without being able to send messages.
 */
export class ObserverManager {
  private ws: WebSocket;
  private sessionId: string;
  private logger: FastifyBaseLogger;

  constructor(
    ws: WebSocket,
    _prisma: PrismaClient,
    sessionId: string | number,
    logger: FastifyBaseLogger
  ) {
    this.ws = ws;
    this.sessionId = String(sessionId);
    this.logger = logger;
  }

  /**
   * Initialize the observer connection.
   * Sends session info and message history, then subscribes to broadcasts.
   */
  async initialize(): Promise<void> {
    // Load session with scenario and all messages
    const session = await getSession(String(this.sessionId));

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

    const messages = await getMessagesForSession(String(this.sessionId));

    // Build scenario info
    const scenarioInfo = (session as any).scenario
      ? {
          id: (session as any).scenario.id,
          name: (session as any).scenario.name,
          description: (session as any).scenario.description,
          partnerPersona: (session as any).scenario.partnerPersona,
        }
      : {
          id: 0,
          name: session.customScenarioName ?? 'Custom Scenario',
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
    const historyMessages: HistoryMessage[] = messages.map((m: any) => ({
      id: m.id,
      role: m.role as 'user' | 'partner' | 'coach',
      content: m.content,
      timestamp: toIsoString(m.timestamp),
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
