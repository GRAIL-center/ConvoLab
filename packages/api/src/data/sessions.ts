import { prisma } from '@workspace/database';
import type { ConversationSession } from '@workspace/database';
import { updateSessionAtomically } from './atomic.js';

function toTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime();
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

/**
 * Creates a new conversation session in Firestore.
 */
export async function createSession(
  data: Omit<ConversationSession, 'id'> & { id?: string }
): Promise<string> {
  const created = await prisma.conversationSession.create({
    data: {
      ...data,
      startedAt: data.startedAt ?? new Date(),
      totalMessages: data.totalMessages ?? 0,
      status: data.status ?? 'ACTIVE',
    } as any,
  });
  return String(created.id);
}

/**
 * Retrieves a conversation session by its ID.
 */
export async function getSession(
  id: string
): Promise<ConversationSession | null> {
  const session = await prisma.conversationSession.findUnique({ where: { id } as any });
  if (!session) return null;

  const scenarioId = (session as any).scenarioId;
  if (!scenarioId) return session;

  const scenario = await prisma.scenario.findUnique({ where: { id: scenarioId } as any });
  return { ...session, scenario } as any;
}

/**
 * Updates a conversation session by ID.
 */
export async function updateSession(
  id: string,
  data: Partial<ConversationSession>
): Promise<ConversationSession> {
  return updateSessionAtomically(id, data);
}

/**
 * Lists conversation sessions.
 */
export async function listSessions(
  options?: { limit?: number; cursor?: string; userId?: string; invitationId?: string }
): Promise<ConversationSession[]> {
  const sessions = await prisma.conversationSession.findMany(
    options
      ? {
          where: {
            ...(options.userId ? { userId: options.userId } : {}),
            ...(options.invitationId ? { invitationId: options.invitationId } : {}),
          },
        }
      : undefined
  );

  return sessions
    .sort((a, b) => toTime(b.startedAt) - toTime(a.startedAt))
    .slice(0, options?.limit);
}

/**
 * Deletes a conversation session by ID.
 */
export async function deleteSession(id: string): Promise<void> {
  await prisma.conversationSession.delete({ where: { id } as any });
}
