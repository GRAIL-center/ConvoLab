import type { OAuth2Namespace } from '@fastify/oauth2';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { handleGoogleAuth } from '../auth/handlers.js';
import { consumeAuthTicket, createAuthCode } from '../auth/nativeAuthStore.js';
import { resolveUserId } from '../auth/resolveUser.js';
import type { GoogleUserInfo } from '../auth/types.js';
import { deleteUserCascade } from '../data/users.js';
import { db as prisma } from '../db/firestoreHelpers.js';
import { getFirestore } from '../lib/firestore.js';
import { nativeAuthRedirect } from './nativeAuth.js';

declare module 'fastify' {
  interface FastifyInstance {
    googleOAuth2?: OAuth2Namespace;
  }
}

async function authRoutes(fastify: FastifyInstance) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  // Google OAuth callback - handles the redirect from Google
  fastify.get('/api/auth/google/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!fastify.googleOAuth2) {
      return reply.status(503).send({ error: 'OAuth not configured' });
    }

    // Native sign-in (plan 18, step 5): read and clear the ticket id up front,
    // whatever happens next, so a later website sign-in in this browser is
    // never treated as native, and so errors below can be routed to the app.
    const nativeTicketId = request.session.get('authNative');
    if (nativeTicketId) {
      request.session.set('authNative', undefined);
    }
    const nativeRedirect = nativeAuthRedirect();

    try {
      // Exchange code for tokens
      const tokenResult =
        await fastify.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);

      // Fetch user info from Google
      const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: {
          Authorization: `Bearer ${tokenResult.token.access_token}`,
        },
      });

      if (!userInfoResponse.ok) {
        fastify.log.error('Failed to fetch user info from Google');
        return nativeTicketId
          ? reply.redirect(`${nativeRedirect}?error=google_fetch_failed`)
          : reply.redirect(`${frontendUrl}/login?error=google_fetch_failed`);
      }

      const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;

      if (nativeTicketId) {
        // Single-use ticket; missing, expired or reused all land here.
        const ticket = await consumeAuthTicket(getFirestore(), nativeTicketId);
        if (!ticket) {
          return reply.redirect(`${nativeRedirect}?error=ticket_invalid`);
        }

        // Merge the app's guest into the account exactly as the web does, but
        // set no cookie: the app gets its token by redeeming the one-time
        // code (never the token itself in a URL; codes are short-lived,
        // single-use and bound to the PKCE verifier).
        const result = await handleGoogleAuth(userInfo, ticket.guestUserId, prisma);
        const code = await createAuthCode(getFirestore(), {
          userId: result.user.id,
          codeChallenge: ticket.codeChallenge,
        });

        fastify.log.info(
          { userId: result.user.id, merged: !!result.mergedFrom },
          'Native app user logged in via Google'
        );
        return reply.redirect(`${nativeRedirect}?code=${code}`);
      }

      const sessionUserId = request.session.get('userId');

      // Handle the auth logic (extracted for testability)
      const result = await handleGoogleAuth(userInfo, sessionUserId, prisma);

      // Set session
      request.session.set('userId', result.user.id);
      request.session.set('name', result.user.name);
      if (result.mergedFrom) {
        request.session.set('mergedFrom', result.mergedFrom);
      }

      // Shorten session duration for authenticated users (90 days vs 1 year for guests)
      request.session.options({ maxAge: 90 * 24 * 60 * 60 });

      fastify.log.info(
        { userId: result.user.id, merged: !!result.mergedFrom },
        'User logged in via Google'
      );

      const authNext = request.session.get('authNext');
      request.session.set('authNext', undefined);
      const safeNext =
        authNext && authNext.startsWith('/') && !authNext.startsWith('//') ? authNext : '/';

      return reply.redirect(`${frontendUrl}${safeNext}`);
    } catch (err) {
      fastify.log.error(err, 'OAuth callback error');
      return nativeTicketId
        ? reply.redirect(`${nativeRedirect}?error=oauth_failed`)
        : reply.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  });

  // Logout
  // For guests with unused invitations, we can "unclaim" the invitation so the link works again
  fastify.post<{
    Querystring: { unclaim?: string };
  }>(
    '/api/auth/logout',
    async (
      request: FastifyRequest<{ Querystring: { unclaim?: string } }>,
      _reply: FastifyReply
    ) => {
      // Bearer first so the guest "unclaim" works for app users too (plan 18).
      const userId = resolveUserId(request);
      const shouldUnclaim = request.query.unclaim === 'true';

      if (userId && shouldUnclaim) {
        // Check if user is a guest with no sessions. `_count` inside `select`
        // was a Prisma relation-aggregation shorthand the shim never
        // implemented (see docs/plans/15-firestore-shim-gaps.md) — use the
        // now-working `count()` instead.
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        });
        const sessionCount = user
          ? await prisma.conversationSession.count({ where: { userId } })
          : 0;

        if (user?.role === 'GUEST' && sessionCount === 0) {
          // Find and unclaim their invitation
          await prisma.invitation.updateMany({
            where: { linkedUserId: userId },
            data: { linkedUserId: null, claimedAt: null },
          });

          // Delete the orphaned guest user (and cascade their
          // ContactMethod/ExternalIdentity rows — see data/users.ts)
          await deleteUserCascade(userId, prisma);

          fastify.log.info({ userId }, 'Guest logged out and invitation unclaimed');
        }
      }

      request.session.delete();
      return { success: true };
    }
  );
}

export default authRoutes;
