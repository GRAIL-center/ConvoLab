import { prisma } from '@workspace/database';
import type { LappScore } from '@workspace/database';

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
  const allScores: any[] = await prisma.lappScore.findMany();
  return allScores.filter(
    (score) => String(score.sessionId) === String(sessionId) || String(score.conversationSessionId) === String(sessionId)
  );
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
