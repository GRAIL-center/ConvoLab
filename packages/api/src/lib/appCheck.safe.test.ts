import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assessAppCheckToken, decideAppCheck, verifyAppCheck } from './appCheck.js';

// The Firebase Admin SDK is mocked: nothing here reaches the network.
const mocks = vi.hoisted(() => ({ verifyToken: vi.fn(), initializeApp: vi.fn() }));
vi.mock('firebase-admin/app', () => ({
  getApps: () => [],
  initializeApp: mocks.initializeApp,
  applicationDefault: () => ({}),
}));
vi.mock('firebase-admin/app-check', () => ({
  getAppCheck: () => ({ verifyToken: mocks.verifyToken }),
}));

function firebaseError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

beforeEach(() => {
  mocks.verifyToken.mockReset();
  mocks.initializeApp.mockReset();
  mocks.initializeApp.mockImplementation((_options: unknown, name: string) => ({ name }));
});

describe('decideAppCheck', () => {
  it('accepts a verified token and keeps the app id', () => {
    for (const isProduction of [true, false]) {
      expect(decideAppCheck({ kind: 'verified', appId: '1:2:ios:3' }, isProduction)).toEqual({
        verified: true,
        reason: 'valid',
        appId: '1:2:ios:3',
      });
    }
  });

  it('rejects a missing token, in dev as well as production', () => {
    for (const isProduction of [true, false]) {
      expect(decideAppCheck({ kind: 'missing' }, isProduction)).toMatchObject({
        verified: false,
        reason: 'missing-token',
      });
    }
  });

  it('rejects a token Firebase refused, in dev as well as production', () => {
    for (const isProduction of [true, false]) {
      const d = decideAppCheck(
        { kind: 'rejected', code: 'app-check/app-check-token-expired', detail: 'expired' },
        isProduction
      );
      expect(d).toMatchObject({
        verified: false,
        reason: 'invalid-token',
        code: 'app-check/app-check-token-expired',
      });
    }
  });

  it('fails closed on a verification error, in dev as well as production', () => {
    for (const isProduction of [true, false]) {
      expect(decideAppCheck({ kind: 'error', detail: 'boom' }, isProduction)).toMatchObject({
        verified: false,
        reason: 'error',
      });
    }
  });

  it('allows an unconfigured setup outside production only', () => {
    const outcome = { kind: 'unconfigured', detail: 'not set' } as const;
    expect(decideAppCheck(outcome, false)).toMatchObject({
      verified: true,
      reason: 'unconfigured-dev-allow',
    });
    expect(decideAppCheck(outcome, true)).toMatchObject({
      verified: false,
      reason: 'unconfigured',
    });
  });
});

describe('assessAppCheckToken', () => {
  it('reports a missing token without calling Firebase', async () => {
    expect(await assessAppCheckToken(undefined, { NODE_ENV: 'production' })).toEqual({
      kind: 'missing',
    });
    expect(await assessAppCheckToken('', { NODE_ENV: 'production' })).toEqual({ kind: 'missing' });
    expect(mocks.verifyToken).not.toHaveBeenCalled();
  });

  it('is unconfigured outside production when APP_CHECK_PROJECT_ID is unset', async () => {
    const outcome = await assessAppCheckToken('t', { NODE_ENV: 'development' });
    expect(outcome.kind).toBe('unconfigured');
    expect(mocks.verifyToken).not.toHaveBeenCalled();
  });

  it('verifies against convolab-490517 in production by default', async () => {
    mocks.verifyToken.mockResolvedValue({ appId: '1:633459139926:android:x', token: {} });
    const outcome = await assessAppCheckToken('t', { NODE_ENV: 'production' });
    expect(outcome).toEqual({ kind: 'verified', appId: '1:633459139926:android:x' });
    expect(mocks.initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'convolab-490517' }),
      expect.any(String)
    );
  });

  it('maps token problems to rejected and other failures to error', async () => {
    mocks.verifyToken.mockRejectedValueOnce(
      firebaseError('app-check/invalid-argument', 'invalid signature')
    );
    expect(await assessAppCheckToken('t', { NODE_ENV: 'production' })).toMatchObject({
      kind: 'rejected',
      code: 'app-check/invalid-argument',
    });

    mocks.verifyToken.mockRejectedValueOnce(new Error('socket hang up'));
    expect(await assessAppCheckToken('t', { NODE_ENV: 'production' })).toMatchObject({
      kind: 'error',
    });
  });

  it('treats an Admin SDK that cannot start as unconfigured', async () => {
    mocks.initializeApp.mockImplementation(() => {
      throw new Error('no project');
    });
    const outcome = await assessAppCheckToken('t', { NODE_ENV: 'production' });
    expect(outcome.kind).toBe('unconfigured');
  });
});

describe('verifyAppCheck', () => {
  it('logs a refusal without the token', async () => {
    const warn = vi.fn();
    const ok = await verifyAppCheck(undefined, { warn }, { NODE_ENV: 'production' });
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'app_check_rejected', reason: 'missing-token' }),
      expect.any(String)
    );
  });

  it('does not log when the token is verified', async () => {
    mocks.verifyToken.mockResolvedValue({ appId: 'a', token: {} });
    const warn = vi.fn();
    const ok = await verifyAppCheck('secret-token', { warn }, { NODE_ENV: 'production' });
    expect(ok).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});
