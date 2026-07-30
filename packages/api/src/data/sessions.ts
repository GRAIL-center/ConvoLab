import { prisma } from '@workspace/database';
import type { ConversationSession } from '@workspace/database';
import { updateSessionAtomically } from './atomic.js';

/**
 * Creates a new conversation session in Firestore.
 */
export async function createSession(
  data: Omit<ConversationSession, 'id'> & { id?: string }
): Promise<string> {
  const created = await prisma.conversationSession.create({ data: data as any });
  return String(created.id);
}

/**
 * Retrieves a conversation session by its ID.
 */
export async function getSession(
  id: string
): Promise<ConversationSession | null> {
  return prisma.conversationSession.findUnique({ where: { id } as any });
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
  _options?: { limit?: number; cursor?: string }
): Promise<ConversationSession[]> {
  return prisma.conversationSession.findMany(_options);
}

/**
 * Deletes a conversation session by ID.
 */
export async function deleteSession(id: string): Promise<void> {
  await prisma.conversationSession.delete({ where: { id } as any });
}
