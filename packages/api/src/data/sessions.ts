import { prisma } from '@workspace/database';
import type { ConversationSession } from '@workspace/database';

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
 * Retrieves a conversation session by its ID, with its scenario attached.
 *
 * The shim doesn't support Prisma's relational `include`, so a plain
 * `findUnique` here returns `session.scenario` as `undefined` — for any
 * scenario-based session (the common case), `ws/handler.ts`'s
 * `!session.scenario && !session.customPartnerPrompt` check then always
 * evaluates true and closes the socket with `NO_SCENARIO` immediately after
 * every connection, which the client's reconnect logic just retries forever
 * (this was the "keeps shifting between connected and connecting" bug).
 * Fetch the scenario explicitly, same pattern as the other migrated routers.
 */
export async function getSession(
  id: string
): Promise<(ConversationSession & { scenario?: unknown }) | null> {
  const session = await prisma.conversationSession.findUnique({ where: { id } as any });
  if (!session) return null;

  const scenarioId = (session as any).scenarioId;
  const scenario = scenarioId
    ? await prisma.scenario.findUnique({ where: { id: scenarioId } })
    : null;

  return { ...session, scenario };
}

/**
 * Updates a conversation session by ID.
 */
export async function updateSession(
  id: string,
  data: Partial<ConversationSession>
): Promise<ConversationSession> {
  return prisma.conversationSession.update({
    where: { id } as any,
    data,
  });
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
