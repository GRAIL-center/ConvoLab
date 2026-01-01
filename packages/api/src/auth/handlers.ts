import type { PrismaClient } from '@workspace/database';
import type { AuthResult, GoogleUserInfo } from './types.js';

/**
 * Merge anonymous user into existing user.
 * Moves all relations from sourceUser to targetUser, then deletes sourceUser.
 *
 * ContactMethods are transferred if they don't conflict (same type+value).
 * Duplicates are dropped. ExternalIdentities are cascade-deleted (source user
 * is always anonymous, so they have none).
 */
export async function mergeUsers(
  sourceUserId: string,
  targetUserId: string,
  prisma: PrismaClient
): Promise<void> {
  // Guard against self-merge (would delete the user)
  if (sourceUserId === targetUserId) return;

  await prisma.$transaction(async (tx) => {
    // Move conversation sessions
    await tx.conversationSession.updateMany({
      where: { userId: sourceUserId },
      data: { userId: targetUserId },
    });

    // Move invitation links (both as recipient and creator)
    await tx.invitation.updateMany({
      where: { linkedUserId: sourceUserId },
      data: { linkedUserId: targetUserId },
    });
    await tx.invitation.updateMany({
      where: { createdById: sourceUserId },
      data: { createdById: targetUserId },
    });

    // Move observation notes (researcher)
    await tx.observationNote.updateMany({
      where: { researcherId: sourceUserId },
      data: { researcherId: targetUserId },
    });

    // Move usage logs
    await tx.usageLog.updateMany({
      where: { userId: sourceUserId },
      data: { userId: targetUserId },
    });

    // Transfer non-conflicting ContactMethods (duplicates are dropped)
    const targetContacts = await tx.contactMethod.findMany({
      where: { userId: targetUserId },
      select: { type: true, value: true },
    });
    const targetKeys = new Set(targetContacts.map((c) => `${c.type}:${c.value}`));

    const sourceContacts = await tx.contactMethod.findMany({
      where: { userId: sourceUserId },
    });

    for (const contact of sourceContacts) {
      if (!targetKeys.has(`${contact.type}:${contact.value}`)) {
        await tx.contactMethod.update({
          where: { id: contact.id },
          data: { userId: targetUserId, primary: false },
        });
      }
      // Duplicates are left behind and cascade-deleted with source user
    }

    // Delete the source user (cascades remaining ContactMethods and ExternalIdentities)
    await tx.user.delete({ where: { id: sourceUserId } });
  });
}

/**
 * Handle Google OAuth authentication.
 * This is the core business logic extracted from the route handler for testability.
 *
 * Flow:
 * 1. Look up existing ExternalIdentity for this Google account
 * 2. If found: log in as that user, optionally merge anonymous session user
 * 3. If not found:
 *    a. If session user exists: link Google to them
 *    b. If email exists in ContactMethod: link to that anonymous user
 *    c. Otherwise: create new user
 * 4. Upsert email as verified ContactMethod
 */
export async function handleGoogleAuth(
  userInfo: GoogleUserInfo,
  sessionUserId: string | undefined,
  prisma: PrismaClient
): Promise<AuthResult> {
  let mergedFrom: string | null = null;

  // Look up existing identity
  const existingIdentity = await prisma.externalIdentity.findUnique({
    where: { provider_externalId: { provider: 'google', externalId: userInfo.sub } },
    include: { user: true },
  });

  let user: { id: string; name: string | null; role: string };

  if (existingIdentity) {
    // Identity exists - log in as that user
    user = existingIdentity.user;

    // Check if we need to merge an anonymous session user
    if (sessionUserId && sessionUserId !== user.id) {
      const sessionUser = await prisma.user.findUnique({
        where: { id: sessionUserId },
        include: { externalIdentities: true },
      });

      // Only merge if session user is anonymous (no external identities)
      if (sessionUser && sessionUser.externalIdentities.length === 0) {
        await mergeUsers(sessionUserId, user.id, prisma);
        mergedFrom = sessionUserId;
      }
    }

    // Update last login
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        name: user.name || userInfo.name, // Only update name if not set
        avatarUrl: userInfo.picture,
      },
    });
  } else {
    // No existing identity for this Google account

    if (sessionUserId) {
      // Link to session user (anonymous user adding Google)
      const sessionUser = await prisma.user.findUnique({
        where: { id: sessionUserId },
      });

      if (sessionUser) {
        user = await prisma.user.update({
          where: { id: sessionUser.id },
          data: {
            name: sessionUser.name || userInfo.name,
            avatarUrl: userInfo.picture,
            role: sessionUser.role === 'GUEST' ? 'USER' : sessionUser.role,
            lastLoginAt: new Date(),
          },
        });

        // Create the external identity
        await prisma.externalIdentity.create({
          data: {
            userId: user.id,
            provider: 'google',
            externalId: userInfo.sub,
            email: userInfo.email,
          },
        });
      } else {
        // Session user doesn't exist anymore, create new
        user = await prisma.user.create({
          data: {
            name: userInfo.name,
            avatarUrl: userInfo.picture,
            role: 'USER',
            lastLoginAt: new Date(),
            externalIdentities: {
              create: {
                provider: 'google',
                externalId: userInfo.sub,
                email: userInfo.email,
              },
            },
          },
        });
      }
    } else {
      // Check if email exists as ContactMethod (link to that user)
      const existingContact = await prisma.contactMethod.findUnique({
        where: { type_value: { type: 'email', value: userInfo.email } },
        include: { user: { include: { externalIdentities: true } } },
      });

      if (existingContact && existingContact.user.externalIdentities.length === 0) {
        // Link Google to existing anonymous user with this email
        user = await prisma.user.update({
          where: { id: existingContact.userId },
          data: {
            name: existingContact.user.name || userInfo.name,
            avatarUrl: userInfo.picture,
            role: existingContact.user.role === 'GUEST' ? 'USER' : existingContact.user.role,
            lastLoginAt: new Date(),
          },
        });

        await prisma.externalIdentity.create({
          data: {
            userId: user.id,
            provider: 'google',
            externalId: userInfo.sub,
            email: userInfo.email,
          },
        });
      } else {
        // Create new user with identity
        user = await prisma.user.create({
          data: {
            name: userInfo.name,
            avatarUrl: userInfo.picture,
            role: 'USER',
            lastLoginAt: new Date(),
            externalIdentities: {
              create: {
                provider: 'google',
                externalId: userInfo.sub,
                email: userInfo.email,
              },
            },
          },
        });
      }
    }
  }

  // Upsert email as ContactMethod (verified since it comes from Google).
  // Note: OAuth providers are authoritative for email ownership. If another user
  // manually added this email (unverified), it transfers to the authenticated owner.
  await prisma.contactMethod.upsert({
    where: { type_value: { type: 'email', value: userInfo.email } },
    update: { verified: true, primary: true, userId: user.id },
    create: {
      userId: user.id,
      type: 'email',
      value: userInfo.email,
      verified: true,
      primary: true,
    },
  });

  return { user, mergedFrom };
}
