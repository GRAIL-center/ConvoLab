import type { Firestore } from '@google-cloud/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CODE_TTL_MS,
  codeChallengeFrom,
  consumeAuthTicket,
  createAuthCode,
  createAuthTicket,
  redeemAuthCode,
  sweepExpiredAuthDocs,
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
    expect(await redeemAuthCode(db, code, VERIFIER)).toEqual({
      userId: 'u1',
      guestUserId: undefined,
    });
    expect(await redeemAuthCode(db, code, VERIFIER)).toBeNull();
  });

  it('carries the ticket guest through to redemption', async () => {
    const code = await createAuthCode(db, {
      userId: 'u1',
      codeChallenge: CHALLENGE,
      guestUserId: 'g9',
    });
    expect(await redeemAuthCode(db, code, VERIFIER)).toEqual({ userId: 'u1', guestUserId: 'g9' });
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

describe('sweeping expired tickets and codes (#244)', () => {
  it('deletes only expired documents, in both collections', async () => {
    const t0 = 1_000_000;
    const oldTicket = await createAuthTicket(db, { codeChallenge: CHALLENGE }, t0);
    const oldCode = await createAuthCode(db, { userId: 'u1', codeChallenge: CHALLENGE }, t0);
    const later = t0 + TICKET_TTL_MS + 1;
    const freshTicket = await createAuthTicket(db, { codeChallenge: CHALLENGE }, later);
    const freshCode = await createAuthCode(db, { userId: 'u1', codeChallenge: CHALLENGE }, later);

    expect(await sweepExpiredAuthDocs(db, later)).toEqual({ tickets: 1, codes: 1 });
    expect((await db.collection('authTickets').doc(oldTicket).get()).exists).toBe(false);
    expect((await db.collection('authCodes').doc(oldCode).get()).exists).toBe(false);
    expect(await consumeAuthTicket(db, freshTicket, later)).not.toBeNull();
    expect(await redeemAuthCode(db, freshCode, VERIFIER, later)).not.toBeNull();
  });

  it('stops at the batch limit and drains the rest on the next sweep', async () => {
    for (let i = 0; i < 5; i++) await createAuthTicket(db, { codeChallenge: CHALLENGE }, 0);
    const after = TICKET_TTL_MS + CODE_TTL_MS;
    expect(await sweepExpiredAuthDocs(db, after, 3)).toEqual({ tickets: 3, codes: 0 });
    expect(await sweepExpiredAuthDocs(db, after, 3)).toEqual({ tickets: 2, codes: 0 });
    expect(await sweepExpiredAuthDocs(db, after, 3)).toEqual({ tickets: 0, codes: 0 });
  });
});
