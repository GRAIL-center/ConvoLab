import cookie from '@fastify/cookie';
import secureSession from '@fastify/secure-session';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

declare module '@fastify/secure-session' {
  interface SessionData {
    userId?: string;
    name?: string | null;
    mergedFrom?: string; // Set when anonymous user was merged into authenticated user
  }
}

async function sessionPlugin(fastify: FastifyInstance) {
  const sessionKey = process.env.SESSION_KEY;
  if (!sessionKey) {
    throw new Error('SESSION_KEY environment variable is required');
  }

  // Cookie plugin is required for secure-session
  await fastify.register(cookie);

  await fastify.register(secureSession, {
    key: Buffer.from(sessionKey, 'hex'),
    cookieName: 'session',
    cookie: {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    },
  });
}

export default fp(sessionPlugin, {
  name: 'session',
});
