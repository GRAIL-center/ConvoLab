import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ACCOUNT_TOKEN_MAX_AGE_S,
  GUEST_TOKEN_MAX_AGE_S,
  issueAuthToken,
  verifyAuthToken,
} from '../lib/authToken.js';

// Any hex string works; the module derives its signing key from it.
const TEST_SESSION_KEY = 'ab'.repeat(32);
let previousSessionKey: string | undefined;

beforeAll(() => {
  previousSessionKey = process.env.SESSION_KEY;
  process.env.SESSION_KEY = TEST_SESSION_KEY;
});

afterAll(() => {
  if (previousSessionKey === undefined) {
    delete process.env.SESSION_KEY;
  } else {
    process.env.SESSION_KEY = previousSessionKey;
  }
});

/** Re-derives the signing key the way the module documents, to forge test tokens. */
function reSign(payloadB64: string): string {
  const key = createHmac('sha256', Buffer.from(TEST_SESSION_KEY, 'hex'))
    .update('convolab-auth-token-v1')
    .digest();
  return createHmac('sha256', key).update(payloadB64).digest('base64url');
}

describe('issueAuthToken / verifyAuthToken', () => {
  it('round-trips a guest and an account token', () => {
    expect(verifyAuthToken(issueAuthToken('user-1', 'guest'))).toBe('user-1');
    expect(verifyAuthToken(issueAuthToken('user-2', 'account'))).toBe('user-2');
  });

  it('uses the cookie lifetimes: 365 days for guests, 90 for accounts', () => {
    const now = Date.now();
    for (const [kind, maxAge] of [
      ['guest', GUEST_TOKEN_MAX_AGE_S],
      ['account', ACCOUNT_TOKEN_MAX_AGE_S],
    ] as const) {
      const token = issueAuthToken('u', kind, now);
      const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
      expect(payload.exp - payload.iat).toBe(maxAge);
    }
  });

  it('rejects a tampered payload', () => {
    const token = issueAuthToken('user-1', 'guest');
    const [payloadB64, sig] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    payload.uid = 'someone-else';
    const forged = `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${sig}`;
    expect(verifyAuthToken(forged)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = issueAuthToken('user-1', 'guest');
    const [payloadB64, sig] = token.split('.');
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(verifyAuthToken(`${payloadB64}.${flipped}`)).toBeNull();
    expect(verifyAuthToken(`${payloadB64}.`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const issuedLongAgo = Date.now() - (GUEST_TOKEN_MAX_AGE_S + 60) * 1000;
    const token = issueAuthToken('user-1', 'guest', issuedLongAgo);
    expect(verifyAuthToken(token)).toBeNull();
    // Sanity: the same token verifies at its own issue time.
    expect(verifyAuthToken(token, issuedLongAgo)).toBe('user-1');
  });

  it('rejects an unknown version even with a valid signature', () => {
    const payload = {
      v: 2,
      uid: 'user-1',
      kind: 'guest',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const forged = `${payloadB64}.${reSign(payloadB64)}`;
    expect(verifyAuthToken(forged)).toBeNull();
    // The forge helper itself is valid: the same payload at v1 verifies.
    const v1B64 = Buffer.from(JSON.stringify({ ...payload, v: 1 })).toString('base64url');
    expect(verifyAuthToken(`${v1B64}.${reSign(v1B64)}`)).toBe('user-1');
  });

  it('rejects garbage shapes', () => {
    expect(verifyAuthToken('')).toBeNull();
    expect(verifyAuthToken('no-dot')).toBeNull();
    expect(verifyAuthToken('a.b.c')).toBeNull();
    expect(verifyAuthToken('.sig')).toBeNull();
  });
});
