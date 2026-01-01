import type { OAuth2Namespace } from '@fastify/oauth2';
import { prisma } from '@workspace/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { handleGoogleAuth } from '../auth/handlers.js';
import type { GoogleUserInfo } from '../auth/types.js';

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
        return reply.redirect(`${frontendUrl}/login?error=google_fetch_failed`);
      }

      const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;
      const sessionUserId = request.session.get('userId');

      // Handle the auth logic (extracted for testability)
      const result = await handleGoogleAuth(userInfo, sessionUserId, prisma);

      // Set session
      request.session.set('userId', result.user.id);
      request.session.set('name', result.user.name);
      if (result.mergedFrom) {
        request.session.set('mergedFrom', result.mergedFrom);
      }

      fastify.log.info(
        { userId: result.user.id, merged: !!result.mergedFrom },
        'User logged in via Google'
      );

      return reply.redirect(frontendUrl);
    } catch (err) {
      fastify.log.error(err, 'OAuth callback error');
      return reply.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  });

  // Logout
  fastify.post('/api/auth/logout', async (request: FastifyRequest, _reply: FastifyReply) => {
    request.session.delete();
    return { success: true };
  });
}

export default authRoutes;
