import type { FastifyRequest } from 'fastify';
import { verifyAuthToken } from '../lib/authToken.js';

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

export function resolveUserId(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return verifyAuthToken(header.slice('Bearer '.length).trim());
  }
  return cookieUserId(request);
}

/**
 * Browsers cannot add headers to a WebSocket, so the native app sends its
 * token as a subprotocol entry: `new WebSocket(url, ['convolab.v1',
 * 'bearer.' + token])` (plan 18, step 3). The website calls
 * `new WebSocket(url)` and takes the cookie path, exactly as today.
 */
export function resolveWsUserId(request: FastifyRequest): string | null {
  const offered = request.headers['sec-websocket-protocol'];
  if (typeof offered === 'string' && offered.length > 0) {
    const bearer = offered
      .split(',')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(WS_BEARER_PREFIX));
    if (bearer) {
      // Same rule as resolveUserId: an invalid token is signed out, not cookie.
      return verifyAuthToken(bearer.slice(WS_BEARER_PREFIX.length));
    }
  }
  return cookieUserId(request);
}
