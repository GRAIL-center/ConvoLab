import { Role } from '@workspace/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { practiceRouter } from '../trpc/routers/practice.js';
import { createTestScenario } from './fixtures/scenario.js';
import { testPrisma } from './setup.js';

/**
 * The App Check gate on practice.start (#243). Requests from the installed app
 * (X-ConvoLab-Client: native) prove themselves with a Firebase App Check token
 * instead of reCAPTCHA; website requests keep reCAPTCHA unchanged. The
 * Firebase verifier and reCAPTCHA are mocked: nothing here reaches the network.
 */

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  verifyRecaptcha: vi.fn(),
}));

vi.mock('firebase-admin/app', () => ({
  getApps: () => [],
  initializeApp: (_options: unknown, name: string) => ({ name }),
  applicationDefault: () => ({}),
}));
vi.mock('firebase-admin/app-check', () => ({
  getAppCheck: () => ({ verifyToken: mocks.verifyToken }),
}));
vi.mock('../lib/recaptcha.js', () => ({ verifyRecaptcha: mocks.verifyRecaptcha }));

const NATIVE = { 'x-convolab-client': 'native' };

function makeContext(userId: string | null, headers: Record<string, string> = {}) {
  const log = { info() {}, warn() {}, error() {} };
  return {
    userId,
    prisma: testPrisma,
    firestore: null as never,
    req: {
      log,
      headers,
      session: { set() {} },
    } as never,
    res: {} as never,
  };
}

describe('practice.start App Check gate (native app)', () => {
  let scenarioId: number | string;

  beforeEach(async () => {
    // Configured, as in production: a token is really checked.
    vi.stubEnv('APP_CHECK_PROJECT_ID', 'convolab-490517');
    // practice.start signs a guest bearer token for app requests.
    vi.stubEnv('SESSION_KEY', 'a'.repeat(64));
    mocks.verifyToken.mockReset();
    mocks.verifyRecaptcha.mockReset();
    // A reCAPTCHA token that would pass, so the tests show it is not consulted.
    mocks.verifyRecaptcha.mockResolvedValue(true);

    const scenario = await createTestScenario(testPrisma);
    await testPrisma.scenario.update({ where: { id: scenario.id }, data: { isActive: true } });
    scenarioId = scenario.id;
    await testPrisma.quotaPreset.create({
      data: { name: 'public-practice', label: 'Public practice', quota: { tokens: 600000 } },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('starts for an anonymous app user with a valid App Check token', async () => {
    mocks.verifyToken.mockResolvedValue({ appId: '1:633459139926:ios:abc', token: {} });
    const caller = practiceRouter.createCaller(
      makeContext(null, { ...NATIVE, 'x-firebase-appcheck': 'good-token' })
    );
    const result = await caller.start({ scenarioId });
    expect(result.sessionId).toBeTruthy();
    // The app gets its guest bearer token back, as before.
    expect(result.authToken).toBeTruthy();
    expect(mocks.verifyToken).toHaveBeenCalledWith('good-token');
    expect(mocks.verifyRecaptcha).not.toHaveBeenCalled();
  });

  it('refuses an app request with no App Check token (BAD_REQUEST)', async () => {
    const caller = practiceRouter.createCaller(makeContext(null, NATIVE));
    await expect(caller.start({ scenarioId })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Captcha verification failed.',
    });
    expect(mocks.verifyToken).not.toHaveBeenCalled();
    expect(await testPrisma.conversationSession.findMany({})).toHaveLength(0);
  });

  it('refuses an app request whose App Check token Firebase rejects (BAD_REQUEST)', async () => {
    mocks.verifyToken.mockRejectedValue(
      Object.assign(new Error('The provided App Check token has invalid signature.'), {
        code: 'app-check/invalid-argument',
      })
    );
    const caller = practiceRouter.createCaller(
      makeContext(null, { ...NATIVE, 'x-firebase-appcheck': 'forged-token' })
    );
    await expect(caller.start({ scenarioId })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await testPrisma.conversationSession.findMany({})).toHaveLength(0);
  });

  it('refuses an app request when verification itself fails (fail closed)', async () => {
    mocks.verifyToken.mockRejectedValue(new Error('network down'));
    const caller = practiceRouter.createCaller(
      makeContext(null, { ...NATIVE, 'x-firebase-appcheck': 'some-token' })
    );
    await expect(caller.start({ scenarioId })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('does not accept a reCAPTCHA token in place of App Check on an app request', async () => {
    const caller = practiceRouter.createCaller(makeContext(null, NATIVE));
    await expect(
      caller.start({ scenarioId, recaptchaToken: 'valid-recaptcha-token' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mocks.verifyRecaptcha).not.toHaveBeenCalled();
  });

  it('holds an app guest (GUEST role) to App Check too', async () => {
    const guest = await testPrisma.user.create({ data: { role: Role.GUEST } });
    const caller = practiceRouter.createCaller(makeContext(guest.id, NATIVE));
    await expect(caller.start({ scenarioId })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('lets a signed-in account in the app start without any token', async () => {
    const user = await testPrisma.user.create({ data: { role: Role.USER, name: 'Signed In' } });
    const caller = practiceRouter.createCaller(makeContext(user.id, NATIVE));
    const result = await caller.start({ scenarioId });
    expect(result.sessionId).toBeTruthy();
    expect(mocks.verifyToken).not.toHaveBeenCalled();
    expect(mocks.verifyRecaptcha).not.toHaveBeenCalled();
  });

  describe('website requests (no native header) are unchanged', () => {
    it('start with a valid reCAPTCHA token and never consult App Check', async () => {
      const caller = practiceRouter.createCaller(makeContext(null));
      const result = await caller.start({ scenarioId, recaptchaToken: 'valid-recaptcha-token' });
      expect(result.sessionId).toBeTruthy();
      // The website keeps its cookie; no bearer token in the response.
      expect(result.authToken).toBeUndefined();
      expect(mocks.verifyRecaptcha).toHaveBeenCalledWith(
        'valid-recaptcha-token',
        expect.anything()
      );
      expect(mocks.verifyToken).not.toHaveBeenCalled();
    });

    it('are refused when reCAPTCHA fails, even if an App Check header is present', async () => {
      mocks.verifyRecaptcha.mockResolvedValue(false);
      mocks.verifyToken.mockResolvedValue({ appId: 'x', token: {} });
      const caller = practiceRouter.createCaller(
        makeContext(null, { 'x-firebase-appcheck': 'good-token' })
      );
      await expect(
        caller.start({ scenarioId, recaptchaToken: 'bad-recaptcha-token' })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(mocks.verifyToken).not.toHaveBeenCalled();
    });

    it('are refused without a reCAPTCHA token', async () => {
      const caller = practiceRouter.createCaller(makeContext(null));
      await expect(caller.start({ scenarioId })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(mocks.verifyRecaptcha).not.toHaveBeenCalled();
    });
  });
});
