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
    startRedirectPath: '/api/auth/google',
    callbackUri: callbackUrl,
    discovery: {
      issuer: 'https://accounts.google.com',
    },
  });
}

export default fp(oauth, {
  name: 'oauth',
  dependencies: ['session'],
});
