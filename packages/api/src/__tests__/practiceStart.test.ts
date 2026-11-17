import { Role } from '@workspace/database';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ACCOUNT_DAILY_LIMIT,
  ACCOUNT_MONTHLY_LIMIT,
  GUEST_CONVERSATIONS_PER_COOKIE,
  IP_HOURLY_NEW_GUEST_STARTS,
  PRACTICE_LIMIT_MESSAGES,
  sanitizeIpForDocId,
  utcDayKey,
  utcHourKey,
  utcMonthKey,
} from '../lib/practiceLimits.js';
import { practiceRouter } from '../trpc/routers/practice.js';
import { createTestScenario } from './fixtures/scenario.js';
import { fakeDb, testPrisma } from './setup.js';

/**
 * The reCAPTCHA gate on practice.start: anonymous visitors and guests must
 * present a token; a signed-in account must not be asked again (being sent
 * to a captcha right after Google sign-in was the 14 Oct 2026 complaint).
 *
 * Conversation limits (account month/day, guest reopen, IP pause) are also
 * enforced here — see docs/plans/20-guest-cost-limits.md.
 */

function makeContext(userId: string | null, ip = '203.0.113.10') {
  const log = { info() {}, warn() {}, error() {} };
  return {
    userId,
    prisma: testPrisma,
    firestore: fakeDb as never,
    req: {
      log,
      ip,
      headers: { 'x-forwarded-for': ip },
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

  it('refuses a draft scenario that is withheld from the public picker', async () => {
    await testPrisma.scenario.update({
      where: { id: scenarioId },
      data: { audience: 'draft' },
    });
    const user = await testPrisma.user.create({ data: { role: Role.USER, name: 'Signed In' } });
    const caller = practiceRouter.createCaller(makeContext(user.id));
    await expect(caller.start({ scenarioId })).rejects.toMatchObject({
      message: 'Scenario not found',
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
  it('treats a cookie or token for a deleted account as anonymous (#242)', async () => {
    // A second device still holds the id of an account deleted elsewhere: it
    // must not skip the captcha or attach new conversations to the dead id.
    const caller = practiceRouter.createCaller(makeContext('deleted-user-id'));
    await expect(caller.start({ scenarioId })).rejects.toMatchObject({
      message: 'Captcha verification failed.',
    });
    expect(
      await testPrisma.conversationSession.findMany({ where: { userId: 'deleted-user-id' } })
    ).toHaveLength(0);
  });
});

describe('practice.start conversation limits', () => {
  let scenarioId: number | string;

  beforeEach(async () => {
    const scenario = await createTestScenario(testPrisma);
    await testPrisma.scenario.update({ where: { id: scenario.id }, data: { isActive: true } });
    scenarioId = scenario.id;
    await seedPracticePreset();
  });

  it('allows the 100th account start and refuses the 101st', async () => {
    const user = await testPrisma.user.create({ data: { role: Role.USER, name: 'Busy' } });
    const monthKey = utcMonthKey();
    await fakeDb
      .collection('practiceUsage')
      .doc(user.id)
      .set({
        monthKey,
        monthCount: ACCOUNT_MONTHLY_LIMIT - 1,
        dayKey: '1970-01-01',
        dayCount: 0,
      });

    const caller = practiceRouter.createCaller(makeContext(user.id));
    const allowed = await caller.start({ scenarioId });
    expect(allowed.sessionId).toBeTruthy();

    await expect(caller.start({ scenarioId })).rejects.toMatchObject({
      message: PRACTICE_LIMIT_MESSAGES.accountMonth,
    });
  });

  it('refuses the 9th account start in a UTC day', async () => {
    const user = await testPrisma.user.create({ data: { role: Role.USER, name: 'Daily' } });
    const now = new Date();
    await fakeDb
      .collection('practiceUsage')
      .doc(user.id)
      .set({
        monthKey: utcMonthKey(now),
        monthCount: ACCOUNT_DAILY_LIMIT,
        dayKey: utcDayKey(now),
        dayCount: ACCOUNT_DAILY_LIMIT,
      });

    const caller = practiceRouter.createCaller(makeContext(user.id));
    await expect(caller.start({ scenarioId })).rejects.toMatchObject({
      message: PRACTICE_LIMIT_MESSAGES.accountDay,
    });
  });

  it('reopens the guest conversation instead of minting another allowance', async () => {
    const guest = await testPrisma.user.create({ data: { role: Role.GUEST } });
    const caller = practiceRouter.createCaller(makeContext(guest.id));
    const first = await caller.start({ scenarioId, recaptchaToken: 'dev-ok' });
    const second = await caller.start({ scenarioId, recaptchaToken: 'dev-ok' });
    expect(second.sessionId).toBe(first.sessionId);

    const invitations = await testPrisma.invitation.findMany({
      where: { linkedUserId: guest.id },
    });
    expect(invitations).toHaveLength(1);
  });

  it('lets a guest start another conversation after spending one, then asks to sign in after five', async () => {
    const guest = await testPrisma.user.create({ data: { role: Role.GUEST } });
    const caller = practiceRouter.createCaller(makeContext(guest.id));

    let previousSessionId: string | null = null;
    for (let i = 0; i < GUEST_CONVERSATIONS_PER_COOKIE; i++) {
      const started = await caller.start({ scenarioId, recaptchaToken: 'dev-ok' });
      if (previousSessionId) {
        expect(started.sessionId).not.toBe(previousSessionId);
      }
      previousSessionId = started.sessionId;

      const invitations = await testPrisma.invitation.findMany({
        where: { linkedUserId: guest.id },
      });
      // Spend the latest invitation so the next Start is allowed to mint another.
      const latest = invitations[invitations.length - 1];
      expect(latest).toBeTruthy();
      await testPrisma.invitation.update({
        where: { id: latest.id },
        data: {
          usage: { inputTokens: 600000, outputTokens: 0, totalTokens: 600000 },
        },
      });
    }

    await expect(caller.start({ scenarioId, recaptchaToken: 'dev-ok' })).rejects.toMatchObject({
      message: PRACTICE_LIMIT_MESSAGES.guestAllowanceSpent,
    });

    const invitations = await testPrisma.invitation.findMany({
      where: { linkedUserId: guest.id },
    });
    expect(invitations).toHaveLength(GUEST_CONVERSATIONS_PER_COOKIE);
  });

  it('refuses the 31st new guest from one IP, but still lets a returning signed-in user through', async () => {
    const ip = '198.51.100.44';
    const now = new Date();
    await fakeDb
      .collection('practiceIp')
      .doc(`${utcHourKey(now)}__${sanitizeIpForDocId(ip)}`)
      .set({ starts: IP_HOURLY_NEW_GUEST_STARTS });

    const guestCaller = practiceRouter.createCaller(makeContext(null, ip));
    await expect(guestCaller.start({ scenarioId, recaptchaToken: 'dev-ok' })).rejects.toMatchObject(
      {
        message: PRACTICE_LIMIT_MESSAGES.guestBusy,
      }
    );

    const returning = await testPrisma.user.create({
      data: { role: Role.USER, name: 'Roommate' },
    });
    // Returning accounts are not counted against the IP pause.
    await fakeDb
      .collection('practiceUsage')
      .doc(returning.id)
      .set({
        monthKey: utcMonthKey(now),
        monthCount: 2,
        dayKey: utcDayKey(now),
        dayCount: 1,
      });

    const signedInCaller = practiceRouter.createCaller(makeContext(returning.id, ip));
    const result = await signedInCaller.start({ scenarioId });
    expect(result.sessionId).toBeTruthy();
  });
});
