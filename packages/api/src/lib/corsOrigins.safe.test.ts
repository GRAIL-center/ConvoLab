import cors from '@fastify/cors';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { APP_ORIGINS, corsOrigins } from './corsOrigins.js';

const SITE = 'https://convolab.us';

/** A bare server with the same CORS registration as server.ts. */
async function serverWith(frontendUrl: string | undefined) {
  const app = Fastify();
  await app.register(cors, { origin: corsOrigins(frontendUrl), credentials: true });
  app.get('/trpc/scenario.list', async () => ({ ok: true }));
  await app.ready();
  return app;
}

/** The preflight a browser or app web view sends before a tRPC call with a bearer token. */
function preflight(app: Awaited<ReturnType<typeof serverWith>>, origin: string) {
  return app.inject({
    method: 'OPTIONS',
    url: '/trpc/scenario.list',
    headers: {
      origin,
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization,content-type',
    },
  });
}

describe('corsOrigins', () => {
  it('keeps the website and adds the iPhone and Android app origins', () => {
    expect(corsOrigins(SITE)).toEqual([SITE, 'capacitor://localhost', 'https://localhost']);
  });

  it('falls back to the local Vite dev server when FRONTEND_URL is unset', () => {
    expect(corsOrigins(undefined)[0]).toBe('http://localhost:5173');
    expect(corsOrigins('')[0]).toBe('http://localhost:5173');
  });
});

describe('CORS on the API', () => {
  it.each([
    SITE,
    ...APP_ORIGINS,
  ])('allows %s, including the Authorization header', async (origin) => {
    const app = await serverWith(SITE);
    const res = await preflight(app, origin);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(String(res.headers['access-control-allow-headers'])).toMatch(/authorization/i);
    await app.close();
  });

  it.each([
    'https://evil.example',
    'http://localhost',
    'capacitor://evil',
    'https://convolab.us.evil.example',
  ])('refuses %s', async (origin) => {
    const app = await serverWith(SITE);
    const res = await preflight(app, origin);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });

  it('answers a plain app request with its own origin, not the website', async () => {
    const app = await serverWith(SITE);
    const res = await app.inject({
      method: 'GET',
      url: '/trpc/scenario.list',
      headers: { origin: 'capacitor://localhost' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('capacitor://localhost');
    await app.close();
  });
});
