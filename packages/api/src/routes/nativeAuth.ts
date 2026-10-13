import type { FastifyInstance } from 'fastify';
import { mergeUsers } from '../auth/handlers.js';
import { createAuthTicket, redeemAuthCode } from '../auth/nativeAuthStore.js';
import { db as prisma } from '../db/firestoreHelpers.js';
import { issueAuthToken, verifyAuthTokenDetailed } from '../lib/authToken.js';
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
      // Only guest-kind tokens qualify; an account has nothing to merge.
      // The merge itself happens at code redemption, never in the callback.
      let guestUserId: string | undefined;
      const header = request.headers.authorization;
      if (typeof header === 'string' && header.startsWith('Bearer ')) {
        const verified = verifyAuthTokenDetailed(header.slice('Bearer '.length).trim());
        if (!verified) {
          return reply.status(401).send({ error: 'invalid_token' });
        }
        if (verified.kind !== 'guest') {
          return reply.status(400).send({ error: 'not_a_guest_token' });
        }
        guestUserId = verified.userId;
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

      const redeemed = await redeemAuthCode(getFirestore(), code, codeVerifier);
      if (!redeemed) {
        return reply.status(400).send({ error: 'invalid_code' });
      }
      const { userId, guestUserId } = redeemed;

      // The PKCE proof above established that this caller is the app that
      // created the ticket, i.e. the holder of the guest token presented to
      // /start. Only now is it safe to merge that guest's conversations into
      // the signed-in account. mergeUsers deletes the guest, which also kills
      // every copy of its 365-day token. Never merge a user who already has an
      // external identity (that is an account, not a guest).
      if (guestUserId && guestUserId !== userId) {
        const guest = await prisma.user.findUnique({ where: { id: guestUserId } });
        const guestIdentities = guest
          ? await prisma.externalIdentity.findMany({ where: { userId: guestUserId } })
          : [];
        if (guest && guestIdentities.length === 0) {
          await mergeUsers(guestUserId, userId, prisma);
          request.log.info({ userId, mergedFrom: guestUserId }, 'Native sign-in merged guest');
        }
      }

      request.log.info({ userId }, 'Native app redeemed sign-in code');
      return { authToken: issueAuthToken(userId, 'account') };
    }
  );
}

export default nativeAuthRoutes;
