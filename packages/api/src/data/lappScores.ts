import { prisma } from '@workspace/database';
import type { LappScore } from '@workspace/database';

function toTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime();
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

/**
 * Creates a new LAPP score entry linked to a session in Firestore.
 */
export async function createLappScore(
  sessionId: string,
  data: Omit<LappScore, 'id' | 'sessionId'> & { id?: string }
): Promise<string> {
  const payload = { ...data, sessionId, conversationSessionId: sessionId } as any;
  const created = await prisma.lappScore.create({ data: payload });
  return String(created.id);
}

/**
 * Retrieves a LAPP score entry by ID.
 */
export async function getLappScore(id: string): Promise<LappScore | null> {
  return prisma.lappScore.findUnique({ where: { id } as any });
}

/**
 * Retrieves all LAPP scores for a given session.
 */
export async function getLappScoresForSession(sessionId: string): Promise<LappScore[]> {
  const scores = await prisma.lappScore.findMany({
    where: { sessionId },
  });

  return scores.sort((a, b) => toTime(a.createdAt) - toTime(b.createdAt));
}

/**
 * Updates a LAPP score entry by ID.
 */
export async function updateLappScore(
  id: string,
  data: Partial<LappScore>
): Promise<LappScore> {
  return prisma.lappScore.update({
    where: { id } as any,
    data,
  });
}

/**
 * Deletes a LAPP score entry by ID.
 */
export async function deleteLappScore(id: string): Promise<void> {
  await prisma.lappScore.delete({ where: { id } as any });
}
