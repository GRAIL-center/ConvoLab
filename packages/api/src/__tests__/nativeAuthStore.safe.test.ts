import type { Firestore } from '@google-cloud/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CODE_TTL_MS,
  codeChallengeFrom,
  consumeAuthTicket,
  createAuthCode,
  createAuthTicket,
  redeemAuthCode,
  TICKET_TTL_MS,
} from '../auth/nativeAuthStore.js';
import { FakeFirestore } from './fakeFirestore.js';

// A valid PKCE verifier: 43+ chars of the RFC 7636 alphabet.
const VERIFIER = 'a'.repeat(43);
const CHALLENGE = codeChallengeFrom(VERIFIER);

let db: Firestore;

beforeEach(() => {
  db = new FakeFirestore() as unknown as Firestore;
});

describe('auth tickets', () => {
  it('round-trips a ticket with and without a guest', async () => {
    const withGuest = await createAuthTicket(db, { codeChallenge: CHALLENGE, guestUserId: 'g1' });
    const withoutGuest = await createAuthTicket(db, { codeChallenge: CHALLENGE });
    expect(await consumeAuthTicket(db, withGuest)).toEqual({
      codeChallenge: CHALLENGE,
      guestUserId: 'g1',
    });
    expect(await consumeAuthTicket(db, withoutGuest)).toEqual({
      codeChallenge: CHALLENGE,
      guestUserId: undefined,
    });
  });

  it('a ticket is single-use', async () => {
    const id = await createAuthTicket(db, { codeChallenge: CHALLENGE });
    expect(await consumeAuthTicket(db, id)).not.toBeNull();
    expect(await consumeAuthTicket(db, id)).toBeNull();
  });

  it('an expired ticket is rejected', async () => {
    const id = await createAuthTicket(db, { codeChallenge: CHALLENGE });
    expect(await consumeAuthTicket(db, id, Date.now() + TICKET_TTL_MS + 1)).toBeNull();
  });

  it('an unknown or malformed ticket id is rejected', async () => {
    expect(await consumeAuthTicket(db, 'does-not-exist')).toBeNull();
    expect(await consumeAuthTicket(db, '')).toBeNull();
    expect(await consumeAuthTicket(db, 'bad/id')).toBeNull();
  });
});

describe('one-time codes', () => {
  it('the right verifier succeeds exactly once', async () => {
    const code = await createAuthCode(db, { userId: 'u1', codeChallenge: CHALLENGE });
    expect(await redeemAuthCode(db, code, VERIFIER)).toBe('u1');
    expect(await redeemAuthCode(db, code, VERIFIER)).toBeNull();
  });

  it('a wrong verifier fails and burns the code', async () => {
    const code = await createAuthCode(db, { userId: 'u1', codeChallenge: CHALLENGE });
    expect(await redeemAuthCode(db, code, 'b'.repeat(43))).toBeNull();
    // The real verifier no longer works either: a guess attempt invalidates it.
    expect(await redeemAuthCode(db, code, VERIFIER)).toBeNull();
  });

  it('an expired code fails', async () => {
    const code = await createAuthCode(db, { userId: 'u1', codeChallenge: CHALLENGE });
    expect(await redeemAuthCode(db, code, VERIFIER, Date.now() + CODE_TTL_MS + 1)).toBeNull();
  });

  it('an unknown or malformed code fails', async () => {
    expect(await redeemAuthCode(db, 'nope', VERIFIER)).toBeNull();
    expect(await redeemAuthCode(db, '', VERIFIER)).toBeNull();
  });
});
