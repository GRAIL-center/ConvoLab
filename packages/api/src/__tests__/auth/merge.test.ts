import { describe, expect, it } from 'vitest';
import { handleGoogleAuth, mergeUsers } from '../../auth/handlers.js';
import { createGoogleUserInfo, googleUsers } from '../fixtures/google-user.js';
import { createTestScenario } from '../fixtures/scenario.js';
import { testPrisma } from '../setup.js';

/**
 * Helper to create a test invitation with all required fields.
 */
async function createTestInvitation(
  prisma: typeof testPrisma,
  createdById: string,
  linkedUserId?: string,
  seed = 1
) {
  return prisma.invitation.create({
    data: {
      token: `test-token-${seed}-${Date.now()}`,
      createdById,
      linkedUserId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      quota: { tokens: 10000 },
    },
  });
}

describe('mergeUsers', () => {
  it('moves ConversationSession from source to target user', async () => {
    const scenario = await createTestScenario(testPrisma, {}, 1);

    const sourceUser = await testPrisma.user.create({ data: { role: 'GUEST' } });
    const targetUser = await testPrisma.user.create({ data: { role: 'USER' } });

    await testPrisma.conversationSession.create({
      data: {
        userId: sourceUser.id,
        scenarioId: scenario.id,
        status: 'ACTIVE',
      },
    });

    await mergeUsers(sourceUser.id, targetUser.id, testPrisma);

    // Session moved to target
    const sessions = await testPrisma.conversationSession.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].userId).toBe(targetUser.id);

    // Source user deleted
    const deletedUser = await testPrisma.user.findUnique({ where: { id: sourceUser.id } });
    expect(deletedUser).toBeNull();
  });

  it('moves Invitation.linkedUserId from source to target user', async () => {
    const sourceUser = await testPrisma.user.create({ data: { role: 'GUEST' } });
    const targetUser = await testPrisma.user.create({ data: { role: 'USER' } });
    const inviter = await testPrisma.user.create({ data: { role: 'ADMIN', isStaff: true } });

    // Create invitation linked to source user
    const invitation = await createTestInvitation(testPrisma, inviter.id, sourceUser.id, 1);

    await mergeUsers(sourceUser.id, targetUser.id, testPrisma);

    const updatedInvitation = await testPrisma.invitation.findUnique({
      where: { id: invitation.id },
    });
    expect(updatedInvitation!.linkedUserId).toBe(targetUser.id);
  });

  it('moves ObservationNote from source to target user', async () => {
    const scenario = await createTestScenario(testPrisma, {}, 2);

    const sourceUser = await testPrisma.user.create({ data: { role: 'GUEST' } });
    const targetUser = await testPrisma.user.create({ data: { role: 'USER' } });
    const inviter = await testPrisma.user.create({ data: { role: 'ADMIN', isStaff: true } });

    // Create invitation (required for ObservationNote)
    const invitation = await createTestInvitation(testPrisma, inviter.id, undefined, 2);

    const session = await testPrisma.conversationSession.create({
      data: {
        userId: targetUser.id,
        scenarioId: scenario.id,
        status: 'ACTIVE',
      },
    });

    await testPrisma.observationNote.create({
      data: {
        sessionId: session.id,
        invitationId: invitation.id,
        researcherId: sourceUser.id,
        content: 'Test observation',
      },
    });

    await mergeUsers(sourceUser.id, targetUser.id, testPrisma);

    const notes = await testPrisma.observationNote.findMany();
    expect(notes).toHaveLength(1);
    expect(notes[0].researcherId).toBe(targetUser.id);
  });

  it('moves UsageLog from source to target user', async () => {
    const sourceUser = await testPrisma.user.create({ data: { role: 'GUEST' } });
    const targetUser = await testPrisma.user.create({ data: { role: 'USER' } });

    await testPrisma.usageLog.create({
      data: {
        userId: sourceUser.id,
        model: 'claude-3-opus',
        streamType: 'partner',
        inputTokens: 100,
        outputTokens: 50,
      },
    });

    await mergeUsers(sourceUser.id, targetUser.id, testPrisma);

    const logs = await testPrisma.usageLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(targetUser.id);
  });

  it('deletes source user after merge', async () => {
    const sourceUser = await testPrisma.user.create({ data: { role: 'GUEST' } });
    const targetUser = await testPrisma.user.create({ data: { role: 'USER' } });

    await mergeUsers(sourceUser.id, targetUser.id, testPrisma);

    const users = await testPrisma.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(targetUser.id);
  });

  it('transfers non-conflicting ContactMethods to target user', async () => {
    const sourceUser = await testPrisma.user.create({ data: { role: 'GUEST' } });
    const targetUser = await testPrisma.user.create({ data: { role: 'USER' } });

    // Source has phone contact method (should be transferred)
    await testPrisma.contactMethod.create({
      data: {
        userId: sourceUser.id,
        type: 'phone',
        value: '+1234567890',
        verified: false,
        primary: true,
      },
    });

    await mergeUsers(sourceUser.id, targetUser.id, testPrisma);

    // Contact method now belongs to target user
    const contacts = await testPrisma.contactMethod.findMany();
    expect(contacts).toHaveLength(1);
    expect(contacts[0].userId).toBe(targetUser.id);
    expect(contacts[0].value).toBe('+1234567890');
    // Primary flag is cleared to avoid conflicts
    expect(contacts[0].primary).toBe(false);
  });

  it('self-merge is a no-op', async () => {
    const user = await testPrisma.user.create({ data: { role: 'USER' } });

    // Self-merge should not delete the user
    await mergeUsers(user.id, user.id, testPrisma);

    // User still exists
    const foundUser = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(foundUser).not.toBeNull();
  });
});

describe('handleGoogleAuth merge scenarios', () => {
  it('merges anonymous session user when authenticating with Google linked to another user', async () => {
    const googleUser = googleUsers.alice;

    // First: Alice creates an account
    const aliceResult = await handleGoogleAuth(googleUser, undefined, testPrisma);
    const aliceId = aliceResult.user.id;

    // Second: Anonymous user creates a session
    const scenario = await createTestScenario(testPrisma, {}, 3);
    const anonymousUser = await testPrisma.user.create({ data: { role: 'GUEST' } });
    await testPrisma.conversationSession.create({
      data: {
        userId: anonymousUser.id,
        scenarioId: scenario.id,
        status: 'ACTIVE',
      },
    });

    // Third: Anonymous user authenticates with Alice's Google account
    const mergeResult = await handleGoogleAuth(googleUser, anonymousUser.id, testPrisma);

    // Returns Alice's user
    expect(mergeResult.user.id).toBe(aliceId);
    // Indicates merge happened
    expect(mergeResult.mergedFrom).toBe(anonymousUser.id);

    // Anonymous user is deleted
    const deletedUser = await testPrisma.user.findUnique({ where: { id: anonymousUser.id } });
    expect(deletedUser).toBeNull();

    // Session now belongs to Alice
    const sessions = await testPrisma.conversationSession.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].userId).toBe(aliceId);

    // Only one user remains
    const userCount = await testPrisma.user.count();
    expect(userCount).toBe(1);
  });

  it('does not merge when session user already has external identities', async () => {
    const aliceGoogle = googleUsers.alice;
    const bobGoogle = googleUsers.bob;

    // Alice has a Google account
    const aliceResult = await handleGoogleAuth(aliceGoogle, undefined, testPrisma);

    // Bob has a different Google account
    const bobResult = await handleGoogleAuth(bobGoogle, undefined, testPrisma);

    // Bob's session tries to authenticate as Alice - should NOT merge because Bob has identities
    const result = await handleGoogleAuth(aliceGoogle, bobResult.user.id, testPrisma);

    // Returns Alice (the owner of the Google account)
    expect(result.user.id).toBe(aliceResult.user.id);
    // No merge flag
    expect(result.mergedFrom).toBeNull();

    // Both users still exist
    const userCount = await testPrisma.user.count();
    expect(userCount).toBe(2);
  });

  it('supports multiple ExternalIdentities per user', async () => {
    // Create anonymous user
    const anonymousUser = await testPrisma.user.create({ data: { role: 'GUEST' } });

    // Link first Google account
    const google1 = createGoogleUserInfo({ sub: 'google-multi-1', email: 'personal@gmail.com' }, 1);
    await handleGoogleAuth(google1, anonymousUser.id, testPrisma);

    // Link second Google account (work account)
    const google2 = createGoogleUserInfo({ sub: 'google-multi-2', email: 'work@company.com' }, 2);
    await handleGoogleAuth(google2, anonymousUser.id, testPrisma);

    // User now has two external identities
    const user = await testPrisma.user.findUnique({
      where: { id: anonymousUser.id },
      include: { externalIdentities: true },
    });
    expect(user!.externalIdentities).toHaveLength(2);
    expect(user!.externalIdentities.map((ei) => ei.email).sort()).toEqual([
      'personal@gmail.com',
      'work@company.com',
    ]);

    // User also has two contact methods
    const contacts = await testPrisma.contactMethod.findMany({
      where: { userId: anonymousUser.id },
    });
    expect(contacts).toHaveLength(2);
  });

  it('authenticating with either Google account logs in as same user', async () => {
    const anonymousUser = await testPrisma.user.create({ data: { role: 'GUEST' } });

    // Link two Google accounts
    const google1 = createGoogleUserInfo({ sub: 'google-either-1' }, 1);
    const google2 = createGoogleUserInfo({ sub: 'google-either-2' }, 2);
    await handleGoogleAuth(google1, anonymousUser.id, testPrisma);
    await handleGoogleAuth(google2, anonymousUser.id, testPrisma);

    // Login with first Google
    const result1 = await handleGoogleAuth(google1, undefined, testPrisma);
    // Login with second Google
    const result2 = await handleGoogleAuth(google2, undefined, testPrisma);

    // Both log in as the same user
    expect(result1.user.id).toBe(anonymousUser.id);
    expect(result2.user.id).toBe(anonymousUser.id);
  });
});
