import type { PrismaClient } from '@workspace/database';

/**
 * Deletes a user and the relations `schema.prisma` marks `onDelete: Cascade`
 * (`ContactMethod`, `ExternalIdentity`), plus nulls out the relations marked
 * `onDelete: SetNull` (`Feedback.userId`, `TelemetryEvent.userId`) so those
 * rows survive the delete, matching what Postgres did automatically.
 *
 * Firestore has no foreign keys or cascade behavior, so the Firestore shim
 * can't replicate this generically — see docs/plans/15-firestore-shim-gaps.md
 * (bug #5). This helper only covers what the one real call site needs
 * (`routes/auth.ts`'s guest-logout cleanup, which only ever runs for a GUEST
 * user with zero sessions). It deliberately does NOT touch
 * `ConversationSession.userId`, `Invitation.createdById`/`linkedUserId`, or
 * `ObservationNote.researcherId` — those had no `onDelete` in the Prisma
 * schema (default Restrict for required relations), and a generic "delete
 * this user" helper shouldn't silently orphan or null out data those models
 * still need. If a future caller needs to delete a user who *does* have
 * sessions/invitations, extend this rather than assuming it already
 * handles that case.
 */
export async function deleteUserCascade(userId: string, prisma: PrismaClient): Promise<void> {
  await Promise.all([
    prisma.contactMethod.deleteMany({ where: { userId } }),
    prisma.externalIdentity.deleteMany({ where: { userId } }),
    prisma.feedback.updateMany({ where: { userId }, data: { userId: null } }),
    prisma.telemetryEvent.updateMany({ where: { userId }, data: { userId: null } }),
  ]);

  await prisma.user.delete({ where: { id: userId } });
}
