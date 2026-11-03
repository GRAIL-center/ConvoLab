import type { Firestore } from '@google-cloud/firestore';
import type { PrismaClient } from '@workspace/database';
import { deleteUserCascade } from './users.js';

/** Sessions created through the pilot study (study.enter). */
const STUDY_SOURCE = 'qualtrics_prolific';

export interface AccountDeletionResult {
  sessionsDeleted: number;
  messagesDeleted: number;
  studySessionsKept: number;
}

/**
 * Deletes everything that identifies a person or holds what they wrote, for
 * the in-app "Delete my account" option (#242; App Store guideline 5.1.1(v)).
 *
 * Deleted: every practice conversation the user owns with its messages
 * (including private coach questions), live scores, staff observation notes
 * and usage logs; their pending native sign-in tickets and codes; their
 * contact methods and Google identity; and the user record itself.
 * Also deleted: invitations they created themselves, and any usage log still
 * carrying their id. Unlinked, not deleted: invitations they claimed (the
 * invitation belongs to whoever issued it) and feedback (kept anonymous, as
 * deleteUserCascade does).
 *
 * Study sessions are KEPT. A pilot participant consented to research use under
 * the study's protocol, and the study's own withdrawal process governs that
 * data, not this button. Pilot pages never show the account menu, so in
 * practice a study participant does not reach this code.
 *
 * Order matters: conversation data first, the user record last, so a failure
 * part-way leaves an account the person can still see and delete again rather
 * than orphaned conversations nobody can reach.
 */
export async function deleteAccountData(
  userId: string,
  prisma: PrismaClient,
  firestore: Firestore
): Promise<AccountDeletionResult> {
  const sessions = await prisma.conversationSession.findMany({ where: { userId } });
  const practiceSessions = sessions.filter((s) => s.studySource !== STUDY_SOURCE);

  let messagesDeleted = 0;
  for (const session of practiceSessions) {
    const sessionId = String(session.id);
    messagesDeleted += await prisma.message.count({ where: { sessionId } });
    await prisma.message.deleteMany({ where: { sessionId } });
    await prisma.lappScore.deleteMany({ where: { sessionId } });
    await prisma.observationNote.deleteMany({ where: { sessionId } });
    await prisma.usageLog.deleteMany({ where: { sessionId } });
    await prisma.conversationSession.delete({ where: { id: session.id } });
  }

  await prisma.invitation.updateMany({
    where: { linkedUserId: userId },
    data: { linkedUserId: null },
  });
  // Invitations the user created themselves (session.startNew's quick-start,
  // whose label carries their own scenario name). Staff-created invitations
  // never reach here: staff accounts are refused before this runs.
  await prisma.invitation.deleteMany({ where: { createdById: userId } });

  // Usage logs can outlive their session (a turn still finishing when the
  // session was deleted); drop any left with this user, except study ones.
  const keptStudySessionIds = new Set(
    sessions.filter((s) => s.studySource === STUDY_SOURCE).map((s) => String(s.id))
  );
  const remainingLogs = await prisma.usageLog.findMany({ where: { userId } });
  for (const log of remainingLogs) {
    if (!keptStudySessionIds.has(String(log.sessionId))) {
      await prisma.usageLog.delete({ where: { id: log.id } });
    }
  }

  for (const [collection, field] of [
    ['authTickets', 'guestUserId'],
    ['authCodes', 'userId'],
    ['authCodes', 'guestUserId'],
  ] as const) {
    const snapshot = await firestore.collection(collection).where(field, '==', userId).get();
    for (const doc of snapshot.docs) {
      await doc.ref.delete();
    }
  }

  await deleteUserCascade(userId, prisma);

  return {
    sessionsDeleted: practiceSessions.length,
    messagesDeleted,
    studySessionsKept: sessions.length - practiceSessions.length,
  };
}
