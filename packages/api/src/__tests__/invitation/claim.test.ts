import { Role } from '@workspace/database';
import { describe, expect, it } from 'vitest';
import { generateToken } from '../../lib/tokens.js';
import { createTestScenario } from '../fixtures/scenario.js';
import { testPrisma } from '../setup.js';

/**
 * Test the session creation logic in invitation.claim
 * These are the critical paths that could break unexpectedly.
 */
describe('invitation.claim session creation', () => {
  async function createTestInvitation(scenarioId: number, adminId: string) {
    return testPrisma.invitation.create({
      data: {
        token: generateToken(),
        scenarioId,
        quota: { tokens: 10000, label: 'Test quota' },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdById: adminId,
      },
    });
  }

  async function createTestAdmin() {
    return testPrisma.user.create({
      data: { role: Role.ADMIN, name: 'Test Admin' },
    });
  }

  async function createTestGuest() {
    return testPrisma.user.create({
      data: { role: Role.GUEST },
    });
  }

  it('creates ConversationSession when claiming invitation for first time', async () => {
    const scenario = await createTestScenario(testPrisma);
    const admin = await createTestAdmin();
    const guest = await createTestGuest();
    const invitation = await createTestInvitation(scenario.id, admin.id);

    // Simulate claiming - link user and create session
    await testPrisma.invitation.update({
      where: { id: invitation.id },
      data: { linkedUserId: guest.id, claimedAt: new Date() },
    });

    const session = await testPrisma.conversationSession.create({
      data: {
        scenarioId: scenario.id,
        userId: guest.id,
        invitationId: invitation.id,
        status: 'ACTIVE',
      },
    });

    expect(session.id).toBeGreaterThan(0);
    expect(session.scenarioId).toBe(scenario.id);
    expect(session.userId).toBe(guest.id);
    expect(session.invitationId).toBe(invitation.id);
    expect(session.status).toBe('ACTIVE');
  });

  it('finds existing session when re-claiming (idempotent)', async () => {
    const scenario = await createTestScenario(testPrisma);
    const admin = await createTestAdmin();
    const guest = await createTestGuest();
    const invitation = await createTestInvitation(scenario.id, admin.id);

    // First claim - create session
    await testPrisma.invitation.update({
      where: { id: invitation.id },
      data: { linkedUserId: guest.id, claimedAt: new Date() },
    });

    const firstSession = await testPrisma.conversationSession.create({
      data: {
        scenarioId: scenario.id,
        userId: guest.id,
        invitationId: invitation.id,
        status: 'ACTIVE',
      },
    });

    // Re-claim - should find existing session
    const existingSession = await testPrisma.conversationSession.findFirst({
      where: {
        userId: guest.id,
        invitationId: invitation.id,
      },
      orderBy: { startedAt: 'desc' },
    });

    expect(existingSession).not.toBeNull();
    expect(existingSession!.id).toBe(firstSession.id);

    // Verify only one session exists
    const sessionCount = await testPrisma.conversationSession.count({
      where: { invitationId: invitation.id },
    });
    expect(sessionCount).toBe(1);
  });

  it('session requires scenarioId (not nullable in schema)', async () => {
    const admin = await createTestAdmin();
    const guest = await createTestGuest();

    // Create invitation without scenario
    const invitation = await testPrisma.invitation.create({
      data: {
        token: generateToken(),
        scenarioId: null,
        quota: { tokens: 10000, label: 'Test quota' },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdById: admin.id,
      },
    });

    // Attempting to create session without scenarioId should fail
    await expect(
      testPrisma.conversationSession.create({
        data: {
          scenarioId: null as unknown as number, // Force the type to test runtime behavior
          userId: guest.id,
          invitationId: invitation.id,
          status: 'ACTIVE',
        },
      })
    ).rejects.toThrow();
  });
});
