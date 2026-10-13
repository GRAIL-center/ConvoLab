import type { FastifyInstance } from 'fastify';
import { createAuthTicket, redeemAuthCode } from '../auth/nativeAuthStore.js';
import { issueAuthToken, verifyAuthToken } from '../lib/authToken.js';
import { getFirestore } from '../lib/firestore.js';

/**
 * The native app's half of Google sign-in (plan 18, step 5): ask for a ticket,
 * open the phone's real browser at /api/auth/google?native=<ticketId>, and
 * redeem the one-time code the `convolab://` redirect carries. The website
 * never calls these routes.
 *
 * The redirect target the callback uses is fixed in config
 * (NATIVE_AUTH_REDIRECT); it is never taken from a request, or the callback
 * would become an open redirect that hands codes to anyone.
 */

export function nativeAuthRedirect(): string {
  return process.env.NATIVE_AUTH_REDIRECT || 'convolab://auth/callback';
}

// base64url(sha256(...)) is exactly 43 characters unpadded.
const CODE_CHALLENGE_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const CODE_SHAPE = /^[A-Za-z0-9_-]{1,128}$/;
// RFC 7636 allows 43-128 chars of [A-Za-z0-9-._~]; be exact so a client bug
// that would weaken PKCE surfaces here instead of shipping.
const CODE_VERIFIER_SHAPE = /^[A-Za-z0-9\-._~]{43,128}$/;

async function nativeAuthRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: { codeChallenge?: unknown } }>(
    '/api/auth/native/start',
    async (request, reply) => {
      const codeChallenge = request.body?.codeChallenge;
      if (typeof codeChallenge !== 'string' || !CODE_CHALLENGE_SHAPE.test(codeChallenge)) {
        return reply.status(400).send({ error: 'invalid_code_challenge' });
      }

      // A guest token here means "merge my guest conversations into the
      // account I am about to sign in to". Only the bearer header counts (the
      // app has no cookie), and a present-but-invalid token is an error, not
      // silently ignored: dropping it would silently lose the guest merge.
      let guestUserId: string | undefined;
      const header = request.headers.authorization;
      if (typeof header === 'string' && header.startsWith('Bearer ')) {
        const userId = verifyAuthToken(header.slice('Bearer '.length).trim());
        if (!userId) {
          return reply.status(401).send({ error: 'invalid_token' });
        }
        guestUserId = userId;
      }

      const ticketId = await createAuthTicket(getFirestore(), { codeChallenge, guestUserId });
      return { ticketId };
    }
  );

  fastify.post<{ Body: { code?: unknown; codeVerifier?: unknown } }>(
    '/api/auth/native/token',
    async (request, reply) => {
      const { code, codeVerifier } = request.body ?? {};
      if (
        typeof code !== 'string' ||
        !CODE_SHAPE.test(code) ||
        typeof codeVerifier !== 'string' ||
        !CODE_VERIFIER_SHAPE.test(codeVerifier)
      ) {
        return reply.status(400).send({ error: 'invalid_request' });
      }

      const userId = await redeemAuthCode(getFirestore(), code, codeVerifier);
      if (!userId) {
        return reply.status(400).send({ error: 'invalid_code' });
      }

      request.log.info({ userId }, 'Native app redeemed sign-in code');
      return { authToken: issueAuthToken(userId, 'account') };
    }
  );
}

export default nativeAuthRoutes;
