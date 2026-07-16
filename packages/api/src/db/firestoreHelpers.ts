// Firestore helper module – provides typed async CRUD functions using the Firestore shim
// The shim (`@workspace/database`) exposes a Prisma‑like client that talks to Firestore.
// We wrap the shim here with convenient functions used throughout the codebase.

import { prisma } from '@workspace/database';
import type {
  ConversationSession,
  Message,
  LappScore,
  User,
  Invitation,
  TelemetryEvent,
} from '@workspace/database';

// Export the raw shim client for any advanced usage
export const db = prisma;

/** Session helpers */
export async function createSession(data: Omit<ConversationSession, 'id'> & { id?: string }): Promise<string> {
  const created = await prisma.conversationSession.create({ data });
  return created.id;
}

export async function getSession(id: string): Promise<ConversationSession | null> {
  return prisma.conversationSession.findUnique({ where: { id } });
}

/** Message helpers */
export async function createMessage(
  sessionId: string,
  data: Omit<Message, 'id' | 'conversationSessionId'> & { id?: string }
): Promise<string> {
  const payload = { ...data, conversationSessionId: sessionId } as Message;
  const created = await prisma.message.create({ data: payload });
  return created.id;
}

/** LAPP score helpers */
export async function createLappScore(
  sessionId: string,
  data: Omit<LappScore, 'id' | 'conversationSessionId'> & { id?: string }
): Promise<string> {
  const payload = { ...data, conversationSessionId: sessionId } as LappScore;
  const created = await prisma.lappScore.create({ data: payload });
  return created.id;
}

/** User helpers */
export async function createUser(data: Omit<User, 'id'> & { id?: string }): Promise<string> {
  const created = await prisma.user.create({ data });
  return created.id;
}

/** Invitation helpers */
export async function createInvitation(data: Omit<Invitation, 'id'> & { id?: string }): Promise<string> {
  const created = await prisma.invitation.create({ data });
  return created.id;
}

/** Telemetry – currently disabled */
export async function logTelemetry(
  _event: TelemetryEvent,
  _props?: Record<string, unknown>,
  _userId?: string
): Promise<void> {
  // No‑op – kept for compatibility while telemetry is turned off.
}

/** Seed helpers – placeholders (populate static data) */
export async function populateQuotaPresets(): Promise<void> {
  // TODO: load static quota preset data and write to Firestore.
}

export async function populateScenarios(): Promise<void> {
  // TODO: load static scenario data and write to Firestore.
}

