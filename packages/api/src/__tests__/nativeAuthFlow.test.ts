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
const oauthPlugin = (await import('../plugins/oauth.js')).default;
const authRoutes = (await import('../routes/auth.js')).default;
const nativeAuthRoutes = (await import('../routes/nativeAuth.js')).default;
// Live binding: testPrisma is assigned in setup's beforeAll, after this import.
const setup = await import('./setup.js');

let googleUser = {
  sub: 'google-sub-1',
  email: 'person@example.com',
  email_verified: true,
  name: 'Test Person',
  picture: null as string | null,
};

let app: FastifyInstance;

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  await fastify.register(sessionPlugin);
  // The REAL start route (plugins/oauth.ts) with dummy Google credentials;
  // only the token exchange is patched out, so ?native= parking and clearing
  // run the production code path.
  await fastify.register(oauthPlugin);
  if (!fastify.googleOAuth2) throw new Error('oauth plugin did not register');
  Object.assign(fastify.googleOAuth2, {
    getAccessTokenFromAuthorizationCodeFlow: async () => ({ token: { access_token: 'tok' } }),
  });
  await fastify.register(authRoutes);
  await fastify.register(nativeAuthRoutes);
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
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3000/api/auth/google/callback';
  googleUser = { ...googleUser, sub: `google-sub-${Math.random().toString(36).slice(2)}` };
  flowDb.reset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => googleUser }))
  );
  app = await buildApp();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await app.close();
});

async function startTicket(guestBearer?: string) {
  const codeVerifier = randomBytes(32).toString('base64url');
  const start = await app.inject({
    method: 'POST',
    url: '/api/auth/native/start',
    payload: { codeChallenge: codeChallengeFrom(codeVerifier) },
    headers: guestBearer ? { authorization: `Bearer ${guestBearer}` } : {},
  });
  expect(start.statusCode).toBe(200);
  return { codeVerifier, ticketId: start.json().ticketId as string };
}

/** Runs the flow through the REAL start route and the callback. */
async function runCallbackWithTicket(opts: { guestBearer?: string } = {}) {
  const { codeVerifier, ticketId } = await startTicket(opts.guestBearer);
  // The phone's browser opening /api/auth/google?native=<ticketId>:
  const browserStart = await app.inject({
    method: 'GET',
    url: `/api/auth/google?native=${ticketId}`,
  });
  expect(browserStart.statusCode).toBe(302);
  expect(String(browserStart.headers.location)).toContain('accounts.google.com');
  const callback = await app.inject({
    method: 'GET',
    url: '/api/auth/google/callback?code=x&state=y',
    headers: { cookie: cookieHeader(browserStart) },
  });
  return { codeVerifier, callback };
}

function codeFrom(callback: { headers: Record<string, unknown> }): string | null {
  return new URL(
    String(callback.headers.location).replace('convolab://', 'https://x/')
  ).searchParams.get('code');
}

describe('native Google sign-in flow', () => {
  it('a native ticket redirects to convolab:// with a code and signs no cookie in', async () => {
    const { codeVerifier, callback } = await runCallbackWithTicket();

    expect(callback.statusCode).toBe(302);
    expect(String(callback.headers.location)).toMatch(
      /^convolab:\/\/auth\/callback\?code=[A-Za-z0-9_-]+$/
    );

    // The browser session that carried the ticket is NOT signed in.
    const whoami = await app.inject({
      method: 'GET',
      url: '/test/whoami',
      headers: { cookie: cookieHeader(callback) },
    });
    expect(whoami.json()).toEqual({ userId: null });

    // Redeeming the code with the verifier yields a working account token.
    const code = codeFrom(callback);
    const redeem = await app.inject({
      method: 'POST',
      url: '/api/auth/native/token',
      payload: { code, codeVerifier },
    });
    expect(redeem.statusCode).toBe(200);
    const userId = verifyAuthToken(redeem.json().authToken);
    expect(userId).toBeTruthy();
    expect(await setup.testPrisma.user.findUnique({ where: { id: userId as string } })).not.toBe(
      null
    );

    // The code is single-use.
    const again = await app.inject({
      method: 'POST',
      url: '/api/auth/native/token',
      payload: { code, codeVerifier },
    });
    expect(again.statusCode).toBe(400);
  });

  it('merges the guest only at redemption, and the guest is deleted', async () => {
    const guest = await setup.testPrisma.user.create({ data: { role: 'GUEST' } });
    const session = await setup.testPrisma.conversationSession.create({
      data: { userId: guest.id, status: 'ACTIVE' },
    });

    const { codeVerifier, callback } = await runCallbackWithTicket({
      guestBearer: issueAuthToken(guest.id, 'guest'),
    });

    // After the callback alone the guest is untouched: not linked, not merged.
    const identitiesBeforeRedeem = await setup.testPrisma.externalIdentity.findMany({
      where: { userId: guest.id },
    });
    expect(identitiesBeforeRedeem).toHaveLength(0);
    expect(await setup.testPrisma.user.findUnique({ where: { id: guest.id } })).not.toBeNull();

    const redeem = await app.inject({
      method: 'POST',
      url: '/api/auth/native/token',
      payload: { code: codeFrom(callback), codeVerifier },
    });
    expect(redeem.statusCode).toBe(200);
    const accountId = verifyAuthToken(redeem.json().authToken) as string;

    // The guest's conversations moved to the account; the guest is gone, so
    // its 365-day token is dead too.
    const movedSession = await setup.testPrisma.conversationSession.findUnique({
      where: { id: session.id },
    });
    expect(movedSession?.userId).toBe(accountId);
    expect(await setup.testPrisma.user.findUnique({ where: { id: guest.id } })).toBeNull();
    expect(verifyAuthToken(issueAuthToken(guest.id, 'guest'))).toBe(guest.id); // token verifies...
    // ...but the user behind it no longer exists, which is the revocation.
  });

  it("ATTACK REGRESSION: a victim completing someone else's ticket never feeds the ticket's guest", async () => {
    // The attacker holds a guest and crafts a ticket for it, then lures the
    // victim to /api/auth/google?native=<ticket>. The victim signs in with a
    // fresh Google account.
    const attackerGuest = await setup.testPrisma.user.create({ data: { role: 'GUEST' } });
    const { callback } = await runCallbackWithTicket({
      guestBearer: issueAuthToken(attackerGuest.id, 'guest'),
    });
    expect(callback.statusCode).toBe(302);

    // The victim's new identity must NOT be attached to the attacker's guest,
    // and the guest must not be upgraded.
    const identity = await setup.testPrisma.externalIdentity.findUnique({
      where: { provider_externalId: { provider: 'google', externalId: googleUser.sub } },
    });
    expect(identity).not.toBeNull();
    expect(identity?.userId).not.toBe(attackerGuest.id);
    const guestAfter = await setup.testPrisma.user.findUnique({
      where: { id: attackerGuest.id },
    });
    expect(guestAfter?.role).toBe('GUEST');
    // The code went to the victim's device, not the attacker, so without it
    // the attacker's verifier is worthless and no merge ever happens.
  });

  it('a missing or reused ticket redirects with error=ticket_invalid', async () => {
    const browserStart = await app.inject({
      method: 'GET',
      url: '/api/auth/google?native=unknownticket',
    });
    const callback = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=x&state=y',
      headers: { cookie: cookieHeader(browserStart) },
    });
    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe('convolab://auth/callback?error=ticket_invalid');
  });

  it('a plain website sign-in after an abandoned native attempt is NOT native', async () => {
    const { ticketId } = await startTicket();
    // Native attempt parks the ticket in the browser session...
    const nativeStart = await app.inject({
      method: 'GET',
      url: `/api/auth/google?native=${ticketId}`,
    });
    // ...the user abandons it at Google, then signs in normally later:
    const webStart = await app.inject({
      method: 'GET',
      url: '/api/auth/google',
      headers: { cookie: cookieHeader(nativeStart) },
    });
    const callback = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=x&state=y',
      headers: { cookie: cookieHeader(webStart) },
    });
    expect(callback.statusCode).toBe(302);
    expect(String(callback.headers.location).startsWith('convolab://')).toBe(false);
    const whoami = await app.inject({
      method: 'GET',
      url: '/test/whoami',
      headers: { cookie: cookieHeader(callback) },
    });
    expect(whoami.json().userId).toBeTruthy();
  });

  it('without a ticket the callback behaves exactly as before: cookie set, web redirect', async () => {
    const callback = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=x&state=y',
    });
    expect(callback.statusCode).toBe(302);
    expect(String(callback.headers.location).startsWith('convolab://')).toBe(false);
    const whoami = await app.inject({
      method: 'GET',
      url: '/test/whoami',
      headers: { cookie: cookieHeader(callback) },
    });
    expect(whoami.json().userId).toBeTruthy();
  });

  it('start rejects a malformed challenge, an invalid bearer, and an account token', async () => {
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

    const account = await app.inject({
      method: 'POST',
      url: '/api/auth/native/start',
      payload: { codeChallenge: codeChallengeFrom('a'.repeat(43)) },
      headers: { authorization: `Bearer ${issueAuthToken('someone', 'account')}` },
    });
    expect(account.statusCode).toBe(400);
    expect(account.json().error).toBe('not_a_guest_token');
  });

  it('token redemption rejects a wrong verifier', async () => {
    const { callback } = await runCallbackWithTicket();
    const redeem = await app.inject({
      method: 'POST',
      url: '/api/auth/native/token',
      payload: { code: codeFrom(callback), codeVerifier: randomBytes(32).toString('base64url') },
    });
    expect(redeem.statusCode).toBe(400);
  });
});
