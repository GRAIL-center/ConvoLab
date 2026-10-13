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
      auth: {
        authorizeHost: 'https://accounts.google.com',
        authorizePath: '/o/oauth2/v2/auth',
        tokenHost: 'https://oauth2.googleapis.com',
        tokenPath: '/token',
      },
    },
    // Don't use startRedirectPath - we'll create custom route with prompt param
    callbackUri: callbackUrl,
  });

  // Custom auth start route that adds prompt=select_account
  fastify.get<{ Querystring: { next?: string; native?: string } }>(
    '/api/auth/google',
    async (request, reply) => {
      if (!fastify.googleOAuth2) {
        fastify.log.error('Google OAuth2 not configured');
        return reply.status(503).send({ error: 'OAuth not configured' });
      }
      try {
        const next = request.query.next?.trim();
        // Only allow same-origin relative paths so this can't be used as an open redirect.
        if (next && next.startsWith('/') && !next.startsWith('//')) {
          request.session.set('authNext', next);
        }

        // Native sign-in (plan 18, step 5): the app opened the phone's browser
        // with a ticket id. Park it in the browser's cookie session, like
        // authNext; the callback reads it once and redirects to convolab://
        // instead of setting a cookie. The id is opaque; the callback
        // validates it against the authTickets collection.
        const native = request.query.native?.trim();
        if (native && /^[A-Za-z0-9_-]{1,64}$/.test(native)) {
          request.session.set('authNative', native);
        } else {
          // Always clear a leftover ticket id: a native flow abandoned at
          // Google (or a hostile ?native= link opened earlier) must not turn
          // a later ordinary website sign-in in this browser into a native
          // one. The session cookie lives for up to a year.
          request.session.set('authNative', undefined);
        }

        const authUrl = await fastify.googleOAuth2.generateAuthorizationUri(request, reply);
        const url = new URL(authUrl);
        url.searchParams.set('prompt', 'select_account');
        return reply.redirect(url.toString());
      } catch (e) {
        fastify.log.error(e, 'Failed to generate Google auth URL');
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    }
  );
}

export default fp(oauth, {
  name: 'oauth',
  dependencies: ['session'],
});
