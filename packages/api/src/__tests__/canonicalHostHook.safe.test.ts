import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { canonicalRedirectTarget } from '../lib/canonicalHost.js';

/**
 * Checks the Fastify side of the canonical-host redirect, which the unit tests
 * on canonicalRedirectTarget cannot: that an onRequest hook returning a
 * reply.redirect() actually short-circuits the request, that the status and
 * Location header come out right, and that returning nothing lets the request
 * fall through to the route. Fastify 5 changed redirect() to (url, code), so
 * the argument order is worth pinning rather than assuming.
 *
 * It builds a miniature app with the same hook as server.ts rather than
 * importing server.ts, which would boot Firestore, OAuth and the WebSocket
 * layer.
 */
function buildApp(frontendUrl: string | undefined) {
  const app = Fastify();
  app.addHook('onRequest', async (request, reply) => {
    const target = canonicalRedirectTarget(request.headers.host, request.url, frontendUrl);
    if (target) return reply.redirect(target, 301);
  });
  app.get('/', async () => ({ served: true }));
  app.get('/study', async () => ({ served: 'study' }));
  return app;
}

describe('canonical-host redirect hook', () => {
  it('301s the www host and sets Location to the canonical URL', async () => {
    const app = buildApp('https://convolab.us');
    const res = await app.inject({
      method: 'GET',
      url: '/study?pid=abc&topic=Guns',
      headers: { host: 'www.convolab.us' },
    });
    expect(res.statusCode).toBe(301);
    expect(res.headers.location).toBe('https://convolab.us/study?pid=abc&topic=Guns');
    // short-circuited: the route must not have run
    expect(res.body).not.toContain('served');
    await app.close();
  });

  it('serves the canonical host normally', async () => {
    const app = buildApp('https://convolab.us');
    const res = await app.inject({
      method: 'GET',
      url: '/',
      headers: { host: 'convolab.us' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ served: true });
    await app.close();
  });

  it('serves a Cloud Run health check on the *.run.app host', async () => {
    const app = buildApp('https://convolab.us');
    const res = await app.inject({
      method: 'GET',
      url: '/',
      headers: { host: 'convolab-api-t4tn3ogqla-uc.a.run.app' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('serves everything when FRONTEND_URL is unset, so local dev is unaffected', async () => {
    const app = buildApp(undefined);
    const res = await app.inject({
      method: 'GET',
      url: '/',
      headers: { host: 'www.convolab.us' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
