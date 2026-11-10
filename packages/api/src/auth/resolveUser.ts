import type { FastifyRequest } from 'fastify';
import { verifyAuthTokenDetailed } from '../lib/authToken.js';

/**
 * Who is making this request? Bearer token first (the native app), cookie
 * session second (the website). Plan 18, step 2.
 *
 * A present-but-invalid bearer token means signed out, never a silent fall
 * back to the cookie: a stale app token must surface as signed out rather
 * than be masked by whatever cookie the web view happens to hold.
 */

/** The subprotocol every native socket offers first (the server echoes it). */
export const WS_PROTOCOL = 'convolab.v1';

/**
 * The handleProtocols callback for @fastify/websocket (server.ts): a handshake
 * with offered protocols only completes when the server echoes one, so select
 * convolab.v1. A browser that offers no protocols never reaches this callback.
 * Lives here so the handshake test exercises the same function the server uses.
 */
export function selectWsProtocol(protocols: Set<string>): string | false {
  return protocols.has(WS_PROTOCOL) ? WS_PROTOCOL : false;
}
/** Prefix of the subprotocol entry that carries the token (base64url + "." only). */
export const WS_BEARER_PREFIX = 'bearer.';

function cookieUserId(request: FastifyRequest): string | null {
  // `request.session` is undefined when the session plugin is not registered
  // (no SESSION_KEY). The ws handlers also read the id as a plain property,
  // so accept both shapes.
  const session = request.session as
    | { get?: (key: 'userId') => string | undefined; userId?: string }
    | undefined;
  if (!session) return null;
  const viaGet = typeof session.get === 'function' ? session.get('userId') : undefined;
  return viaGet ?? session.userId ?? null;
}

/** Looks up a user's role; null when the user no longer exists. */
export type RoleLookup = (userId: string) => Promise<string | null>;

export const defaultRoleLookup: RoleLookup = async (userId) => {
  // Imported lazily so this module stays free of database setup at load time.
  const { db } = await import('../db/firestoreHelpers.js');
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  return (user?.role as string | undefined) ?? null;
};

/**
 * A guest token stays valid only while its user is still a guest (#244). When
 * a guest signs in with Google on the website, the same user id becomes an
 * account, and the year-long guest token the app issued earlier must stop
 * working: otherwise anyone holding that old token (a shared or lost phone)
 * would be signed in to the new account. Account tokens and cookies are not
 * checked here, so only guest app requests pay for the lookup.
 */
async function verifyBearer(token: string, lookupRole: RoleLookup): Promise<string | null> {
  const verified = verifyAuthTokenDetailed(token);
  if (!verified) return null;
  if (verified.kind === 'guest') {
    const role = await lookupRole(verified.userId);
    if (role !== 'GUEST') return null;
  }
  return verified.userId;
}

export async function resolveUserId(
  request: FastifyRequest,
  lookupRole: RoleLookup = defaultRoleLookup
): Promise<string | null> {
  const header = request.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return verifyBearer(header.slice('Bearer '.length).trim(), lookupRole);
  }
  return cookieUserId(request);
}

/**
 * Browsers cannot add headers to a WebSocket, so the native app sends its
 * token as a subprotocol entry: `new WebSocket(url, ['convolab.v1',
 * 'bearer.' + token])` (plan 18, step 3). The website calls
 * `new WebSocket(url)` and takes the cookie path, exactly as today.
 */
export async function resolveWsUserId(
  request: FastifyRequest,
  lookupRole: RoleLookup = defaultRoleLookup
): Promise<string | null> {
  const offered = request.headers['sec-websocket-protocol'];
  if (typeof offered === 'string' && offered.length > 0) {
    const bearer = offered
      .split(',')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(WS_BEARER_PREFIX));
    if (bearer) {
      // Same rule as resolveUserId: an invalid token is signed out, not cookie.
      return verifyBearer(bearer.slice(WS_BEARER_PREFIX.length), lookupRole);
    }
  }
  return cookieUserId(request);
}
