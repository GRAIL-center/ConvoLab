import { prisma } from '@workspace/database';
import type { Message } from '@workspace/database';
import { createMessageAndIncrementSession } from './atomic.js';

/**
 * Creates a new message linked to a conversation session in Firestore.
 */
export async function createMessage(
  sessionId: string,
  data: Omit<Message, 'id' | 'sessionId'> & { id?: string }
): Promise<string> {
  return createMessageAndIncrementSession(sessionId, data);
}

/**
 * Retrieves a message by its ID.
 */
export async function getMessage(id: string): Promise<Message | null> {
  return prisma.message.findUnique({ where: { id } as any });
}

/**
 * Retrieves all messages belonging to a given session.
 */
export async function getMessagesForSession(sessionId: string): Promise<Message[]> {
  const allMessages: any[] = await prisma.message.findMany();
  return allMessages.filter(
    (m) => String(m.sessionId) === String(sessionId) || String(m.conversationSessionId) === String(sessionId)
  );
}

/**
 * Updates a message by ID.
 */
export async function updateMessage(
  id: string,
  data: Partial<Message>
): Promise<Message> {
  return prisma.message.update({
    where: { id } as any,
    data,
  });
}

/**
 * Deletes a message by ID.
 */
export async function deleteMessage(id: string): Promise<void> {
  await prisma.message.delete({ where: { id } as any });
}
