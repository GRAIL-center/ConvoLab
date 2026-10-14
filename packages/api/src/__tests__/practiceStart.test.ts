import { Role } from '@workspace/database';
import { beforeEach, describe, expect, it } from 'vitest';
import { practiceRouter } from '../trpc/routers/practice.js';
import { createTestScenario } from './fixtures/scenario.js';
import { testPrisma } from './setup.js';

/**
 * The reCAPTCHA gate on practice.start: anonymous visitors and guests must
 * present a token; a signed-in account must not be asked again (being sent
 * to a captcha right after Google sign-in was the 14 Oct 2026 complaint).
 */

function makeContext(userId: string | null) {
  const log = { info() {}, warn() {}, error() {} };
  return {
    userId,
    prisma: testPrisma,
    firestore: null as never,
    req: {
      log,
      headers: {},
      session: { set() {} },
    } as never,
    res: {} as never,
  };
}

async function seedPracticePreset() {
  await testPrisma.quotaPreset.create({
    data: { name: 'public-practice', label: 'Public practice', quota: { tokens: 600000 } },
  });
}

describe('practice.start captcha gate', () => {
  let scenarioId: number | string;

  beforeEach(async () => {
    const scenario = await createTestScenario(testPrisma);
    // The in-memory fake applies no schema defaults, and practice.start
    // rejects inactive scenarios.
    await testPrisma.scenario.update({ where: { id: scenario.id }, data: { isActive: true } });
    scenarioId = scenario.id;
    await seedPracticePreset();
  });

  it('rejects an anonymous visitor without a captcha token', async () => {
    const caller = practiceRouter.createCaller(makeContext(null));
    await expect(caller.start({ scenarioId })).rejects.toMatchObject({
      message: 'Captcha verification failed.',
    });
  });

  it('rejects a guest without a captcha token (a guest is not an account)', async () => {
    const guest = await testPrisma.user.create({ data: { role: Role.GUEST } });
    const caller = practiceRouter.createCaller(makeContext(guest.id));
    await expect(caller.start({ scenarioId })).rejects.toMatchObject({
      message: 'Captcha verification failed.',
    });
  });

  it('lets a signed-in account start without a captcha token', async () => {
    const user = await testPrisma.user.create({ data: { role: Role.USER, name: 'Signed In' } });
    const caller = practiceRouter.createCaller(makeContext(user.id));
    const result = await caller.start({ scenarioId });
    expect(result.sessionId).toBeTruthy();
    const session = await testPrisma.conversationSession.findUnique({
      where: { id: result.sessionId },
    });
    expect(session?.userId).toBe(user.id);
  });
});
