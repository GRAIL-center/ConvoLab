import oauthPlugin from '@fastify/oauth2';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

async function oauth(fastify: FastifyInstance) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

  if (!clientId || !clientSecret || !callbackUrl) {
    fastify.log.warn(
      'Google OAuth not configured - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL required'
    );
    return;
  }

  await fastify.register(oauthPlugin, {
    name: 'googleOAuth2',
    scope: ['openid', 'email', 'profile'],
    credentials: {
      client: {
        id: clientId,
        secret: clientSecret,
      },
    },
    // Don't use startRedirectPath - we'll create custom route with prompt param
    callbackUri: callbackUrl,
    discovery: {
      issuer: 'https://accounts.google.com',
    },
  });

  // Custom auth start route that adds prompt=select_account
  fastify.get('/api/auth/google', async (request, reply) => {
    if (!fastify.googleOAuth2) {
      fastify.log.error('Google OAuth2 not configured');
      return reply.status(503).send({ error: 'OAuth not configured' });
    }
    try {
      const authUrl = await fastify.googleOAuth2.generateAuthorizationUri(request);
      const url = new URL(authUrl);
      url.searchParams.set('prompt', 'select_account');
      return reply.redirect(url.toString());
    } catch (e) {
      fastify.log.error(e, 'Failed to generate Google auth URL');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
}

export default fp(oauth, {
  name: 'oauth',
  dependencies: ['session'],
});
