import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless bearer tokens for the native app (mobile roadmap phase 2, plan 18).
 *
 * The installed app cannot use the website's session cookie (different origin),
 * so it authenticates every request with `Authorization: Bearer <token>`. The
 * website never sends these; cookie sign-in is unchanged.
 *
 * Token shape: base64url(JSON payload) + "." + base64url(HMAC-SHA256 of the
 * payload). The signing key is derived from SESSION_KEY rather than reusing its
 * bytes directly, so the cookie key and the token key stay distinct purposes.
 *
 * Known limitation, accepted in plan 18: tokens are stateless, so sign-out on a
 * phone cannot revoke a token that was copied elsewhere. Deleting the user makes
 * it useless (every lookup fails). Real revocation means short-lived access
 * tokens plus a refresh token, a later decision.
 */

const KEY_DERIVATION_LABEL = 'convolab-auth-token-v1';
const TOKEN_VERSION = 1;

export const GUEST_TOKEN_MAX_AGE_S = 365 * 24 * 60 * 60; // matches the guest cookie
export const ACCOUNT_TOKEN_MAX_AGE_S = 90 * 24 * 60 * 60; // matches the Google cookie

export type AuthTokenKind = 'guest' | 'account';

interface AuthTokenPayload {
  v: number;
  uid: string;
  kind: AuthTokenKind;
  iat: number;
  exp: number;
}

let cachedKey: { sessionKey: string; derived: Buffer } | null = null;

function signingKey(): Buffer {
  const sessionKey = process.env.SESSION_KEY;
  if (!sessionKey) {
    throw new Error('SESSION_KEY environment variable is required to sign auth tokens');
  }
  if (!cachedKey || cachedKey.sessionKey !== sessionKey) {
    cachedKey = {
      sessionKey,
      derived: createHmac('sha256', Buffer.from(sessionKey, 'hex'))
        .update(KEY_DERIVATION_LABEL)
        .digest(),
    };
  }
  return cachedKey.derived;
}

function sign(payloadB64: string): Buffer {
  return createHmac('sha256', signingKey()).update(payloadB64).digest();
}

export function issueAuthToken(userId: string, kind: AuthTokenKind, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const payload: AuthTokenPayload = {
    v: TOKEN_VERSION,
    uid: userId,
    kind,
    iat,
    exp: iat + (kind === 'guest' ? GUEST_TOKEN_MAX_AGE_S : ACCOUNT_TOKEN_MAX_AGE_S),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${payloadB64}.${sign(payloadB64).toString('base64url')}`;
}

// Canonical shape: base64url payload, dot, 43-char base64url HMAC-SHA256.
// Enforced before decoding because Buffer.from(_, 'base64url') never throws
// and tolerates many spellings of the same bytes; without this check,
// infinitely many strings would verify for one token, which would break
// anything that ever keys on the token string (a deny list, a rate limit).
const TOKEN_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/;

/** Returns the user id for a valid, unexpired token, otherwise null. */
export function verifyAuthToken(token: string, now = Date.now()): string | null {
  if (!TOKEN_SHAPE.test(token)) return null;
  const dot = token.indexOf('.');
  const payloadB64 = token.slice(0, dot);
  const signature = Buffer.from(token.slice(dot + 1), 'base64url');
  const expected = sign(payloadB64);
  // Constant-time comparison; length check first because timingSafeEqual throws
  // on unequal lengths (the length of the correct signature is public anyway).
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    return null;
  }

  let payload: AuthTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload.v !== TOKEN_VERSION) return null;
  if (typeof payload.uid !== 'string' || payload.uid.length === 0) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return null;
  return payload.uid;
}
