import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';

/**
 * Tickets and one-time codes for native Google sign-in (plan 18, step 5).
 *
 * A ticket pins a PKCE code challenge (and the guest to merge, if any) for the
 * ten minutes between the app asking to sign in and Google redirecting back.
 * A code is what the `convolab://` redirect hands the app; the app redeems it
 * within two minutes, proving it holds the code verifier.
 *
 * Both collections hold no conversation data. Expiry fields are stored as
 * epoch milliseconds, not Dates: these are raw Firestore reads (not the shim),
 * and raw reads return Timestamp objects, which is exactly the comparison bug
 * B26 was (see docs/bugs.md). Numbers compare the same everywhere, including
 * the in-memory test fake. Consumed documents are deleted in the consuming
 * transaction; an abandoned ticket or code is deleted if it is ever read
 * again, and otherwise sits inert past its expiry (both collections hold only
 * random ids, a hash, a user id and an expiry; a periodic sweep can come later).
 */

const TICKETS_COLLECTION = 'authTickets';
const CODES_COLLECTION = 'authCodes';

export const TICKET_TTL_MS = 10 * 60 * 1000;
export const CODE_TTL_MS = 2 * 60 * 1000;

export interface AuthTicket {
  codeChallenge: string;
  guestUserId?: string;
}

/** base64url(sha256(verifier)), the PKCE S256 transform (RFC 7636). */
export function codeChallengeFrom(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier, 'utf8').digest('base64url');
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function createAuthTicket(
  db: Firestore,
  ticket: AuthTicket,
  now = Date.now()
): Promise<string> {
  const ticketId = randomBytes(16).toString('base64url');
  await db
    .collection(TICKETS_COLLECTION)
    .doc(ticketId)
    .set({
      codeChallenge: ticket.codeChallenge,
      guestUserId: ticket.guestUserId ?? null,
      expiresAtMs: now + TICKET_TTL_MS,
    });
  return ticketId;
}

/**
 * Loads and deletes a ticket in one transaction, so a ticket is single-use
 * even if Google ever delivered the callback twice. Missing, already used
 * (= already deleted) and expired all return null.
 */
export async function consumeAuthTicket(
  db: Firestore,
  ticketId: string,
  now = Date.now()
): Promise<AuthTicket | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(ticketId)) return null;
  return db.runTransaction(async (tx) => {
    const ref = db.collection(TICKETS_COLLECTION).doc(ticketId);
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return null;
    const data = snapshot.data() as {
      codeChallenge?: string;
      guestUserId?: string | null;
      expiresAtMs?: number;
    };
    tx.delete(ref);
    if (typeof data.expiresAtMs !== 'number' || data.expiresAtMs <= now) return null;
    if (typeof data.codeChallenge !== 'string') return null;
    return { codeChallenge: data.codeChallenge, guestUserId: data.guestUserId ?? undefined };
  });
}

export async function createAuthCode(
  db: Firestore,
  input: { userId: string; codeChallenge: string; guestUserId?: string },
  now = Date.now()
): Promise<string> {
  const code = randomBytes(32).toString('base64url');
  await db
    .collection(CODES_COLLECTION)
    .doc(code)
    .set({
      userId: input.userId,
      codeChallenge: input.codeChallenge,
      // The ticket's guest rides along to redemption: merging it there, after
      // the PKCE proof, is what stops a hostile ticket from attaching a
      // victim's fresh Google identity to an attacker-held guest (the
      // callback itself never links the guest).
      guestUserId: input.guestUserId ?? null,
      expiresAtMs: now + CODE_TTL_MS,
    });
  return code;
}

export interface RedeemedAuthCode {
  userId: string;
  guestUserId?: string;
}

/**
 * Redeems a one-time code against its PKCE verifier. The document is deleted
 * inside the transaction, so two simultaneous redemptions cannot both succeed
 * and nothing lingers in the collection. Returns the user id (and the guest to
 * merge, if the ticket carried one), or null for a missing, expired or
 * mismatched code.
 */
export async function redeemAuthCode(
  db: Firestore,
  code: string,
  codeVerifier: string,
  now = Date.now()
): Promise<RedeemedAuthCode | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(code)) return null;
  return db.runTransaction(async (tx) => {
    const ref = db.collection(CODES_COLLECTION).doc(code);
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return null;
    const data = snapshot.data() as {
      userId?: string;
      codeChallenge?: string;
      guestUserId?: string | null;
      expiresAtMs?: number;
    };
    // Single use: redeemed, expired and guessed-at codes all leave nothing
    // behind. A wrong verifier burns the code too, so someone guessing cannot
    // leave the real one replayable.
    tx.delete(ref);
    if (typeof data.expiresAtMs !== 'number' || data.expiresAtMs <= now) return null;
    if (
      typeof data.codeChallenge !== 'string' ||
      typeof data.userId !== 'string' ||
      !constantTimeEquals(codeChallengeFrom(codeVerifier), data.codeChallenge)
    ) {
      return null;
    }
    return { userId: data.userId, guestUserId: data.guestUserId ?? undefined };
  });
}
