import { prisma } from '@workspace/database';
import type { Message } from '@workspace/database';
import { createMessageAndIncrementSession } from './atomic.js';

function toTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime();
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

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
  const messages = await prisma.message.findMany({
    where: { sessionId },
  });

  return messages.sort((a, b) => toTime(a.timestamp) - toTime(b.timestamp));
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
