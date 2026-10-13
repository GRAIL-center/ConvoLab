import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeFirestore } from './fakeFirestore.js';

// The native auth store reads Firestore through lib/firestore.ts, which is not
// covered by the setup.ts shim mock, so point it at an in-memory fake here.
const flowDb = new FakeFirestore();
vi.mock('../lib/firestore.js', () => ({
  getFirestore: () => flowDb,
}));

const { issueAuthToken, verifyAuthToken } = await import('../lib/authToken.js');
const { codeChallengeFrom } = await import('../auth/nativeAuthStore.js');
const sessionPlugin = (await import('../plugins/session.js')).default;
const authRoutes = (await import('../routes/auth.js')).default;
const nativeAuthRoutes = (await import('../routes/nativeAuth.js')).default;
// Live binding: testPrisma is assigned in setup's beforeAll, after this import.
const setup = await import('./setup.js');

const GOOGLE_USER = {
  sub: 'google-sub-1',
  email: 'person@example.com',
  email_verified: true,
  name: 'Test Person',
  picture: null,
};

let app: FastifyInstance;

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  await fastify.register(sessionPlugin);
  // Stand-in for the @fastify/oauth2 decoration; the callback only calls this
  // one method, and Google's userinfo endpoint is stubbed via global fetch.
  fastify.decorate('googleOAuth2', {
    getAccessTokenFromAuthorizationCodeFlow: async () => ({ token: { access_token: 'tok' } }),
  } as never);
  await fastify.register(authRoutes);
  await fastify.register(nativeAuthRoutes);
  // Test-only helpers: seed a session value the way /api/auth/google? would,
  // and read who the cookie says we are.
  fastify.get<{ Querystring: { id: string } }>('/test/set-native', async (request) => {
    request.session.set('authNative', request.query.id);
    return { ok: true };
  });
  fastify.get('/test/whoami', async (request) => ({
    userId: request.session.get('userId') ?? null,
  }));
  await fastify.ready();
  return fastify;
}

function cookieHeader(response: { headers: Record<string, unknown> }): string {
  // Reuse the raw set-cookie pair: secure-session values must round-trip
  // byte-for-byte, and inject's parsed `cookies[].value` is already decoded.
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map((entry) => String(entry).split(';')[0]).join('; ');
}

beforeEach(async () => {
  process.env.SESSION_KEY = process.env.SESSION_KEY || 'ab'.repeat(32);
  flowDb.reset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => GOOGLE_USER }))
  );
  app = await buildApp();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await app.close();
});

/** Runs the whole native flow up to the callback; returns the redirect and cookie. */
async function runCallbackWithTicket(opts: { guestBearer?: string } = {}) {
  const codeVerifier = randomBytes(32).toString('base64url');
  const start = await app.inject({
    method: 'POST',
    url: '/api/auth/native/start',
    payload: { codeChallenge: codeChallengeFrom(codeVerifier) },
    headers: opts.guestBearer ? { authorization: `Bearer ${opts.guestBearer}` } : {},
  });
  expect(start.statusCode).toBe(200);
  const { ticketId } = start.json();

  const seeded = await app.inject({ method: 'GET', url: `/test/set-native?id=${ticketId}` });
  const callback = await app.inject({
    method: 'GET',
    url: '/api/auth/google/callback?code=x&state=y',
    headers: { cookie: cookieHeader(seeded) },
  });
  return { codeVerifier, callback };
}

describe('native Google sign-in flow', () => {
  it('a native ticket redirects to convolab:// with a code and signs no cookie in', async () => {
    const { codeVerifier, callback } = await runCallbackWithTicket();

    expect(callback.statusCode).toBe(302);
    const location = callback.headers.location as string;
    expect(location).toMatch(/^convolab:\/\/auth\/callback\?code=[A-Za-z0-9_-]+$/);

    // The browser session that carried the ticket is NOT signed in.
    const whoami = await app.inject({
      method: 'GET',
      url: '/test/whoami',
      headers: { cookie: cookieHeader(callback) },
    });
    expect(whoami.json()).toEqual({ userId: null });

    // Redeeming the code with the verifier yields a working account token.
    const code = new URL(location.replace('convolab://', 'https://x/')).searchParams.get('code');
    const redeem = await app.inject({
      method: 'POST',
      url: '/api/auth/native/token',
      payload: { code, codeVerifier },
    });
    expect(redeem.statusCode).toBe(200);
    const { authToken } = redeem.json();
    const userId = verifyAuthToken(authToken);
    expect(userId).toBeTruthy();
    const user = await setup.testPrisma.user.findUnique({ where: { id: userId as string } });
    expect(user).not.toBeNull();

    // The code is single-use.
    const again = await app.inject({
      method: 'POST',
      url: '/api/auth/native/token',
      payload: { code, codeVerifier },
    });
    expect(again.statusCode).toBe(400);
  });

  it("a guest's ticket carries its user id into the merge", async () => {
    const guest = await setup.testPrisma.user.create({ data: { role: 'GUEST' } });
    const { codeVerifier, callback } = await runCallbackWithTicket({
      guestBearer: issueAuthToken(guest.id, 'guest'),
    });
    const code = new URL(
      (callback.headers.location as string).replace('convolab://', 'https://x/')
    ).searchParams.get('code');
    const redeem = await app.inject({
      method: 'POST',
      url: '/api/auth/native/token',
      payload: { code, codeVerifier },
    });
    // handleGoogleAuth upgrades the guest in place for a new Google identity,
    // so the account token belongs to the same user id.
    expect(verifyAuthToken(redeem.json().authToken)).toBe(guest.id);
  });

  it('a missing or reused ticket redirects with error=ticket_invalid', async () => {
    const seeded = await app.inject({ method: 'GET', url: '/test/set-native?id=unknownticket' });
    const callback = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=x&state=y',
      headers: { cookie: cookieHeader(seeded) },
    });
    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe('convolab://auth/callback?error=ticket_invalid');
  });

  it('without a ticket the callback behaves exactly as before: cookie set, web redirect', async () => {
    const callback = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=x&state=y',
    });
    expect(callback.statusCode).toBe(302);
    expect((callback.headers.location as string).startsWith('convolab://')).toBe(false);
    const whoami = await app.inject({
      method: 'GET',
      url: '/test/whoami',
      headers: { cookie: cookieHeader(callback) },
    });
    expect(whoami.json().userId).toBeTruthy();
  });

  it('start rejects a malformed challenge and an invalid guest token', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/native/start',
      payload: { codeChallenge: 'short' },
    });
    expect(bad.statusCode).toBe(400);

    const stale = await app.inject({
      method: 'POST',
      url: '/api/auth/native/start',
      payload: { codeChallenge: codeChallengeFrom('a'.repeat(43)) },
      headers: { authorization: 'Bearer not-a-token' },
    });
    expect(stale.statusCode).toBe(401);
  });

  it('token redemption rejects a wrong verifier', async () => {
    const { callback } = await runCallbackWithTicket();
    const code = new URL(
      (callback.headers.location as string).replace('convolab://', 'https://x/')
    ).searchParams.get('code');
    const redeem = await app.inject({
      method: 'POST',
      url: '/api/auth/native/token',
      payload: { code, codeVerifier: randomBytes(32).toString('base64url') },
    });
    expect(redeem.statusCode).toBe(400);
  });
});
