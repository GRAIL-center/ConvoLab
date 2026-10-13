import type { FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveUserId, resolveWsUserId, WS_PROTOCOL } from '../auth/resolveUser.js';
import { issueAuthToken } from '../lib/authToken.js';

let previousSessionKey: string | undefined;

beforeAll(() => {
  previousSessionKey = process.env.SESSION_KEY;
  process.env.SESSION_KEY = 'cd'.repeat(32);
});

afterAll(() => {
  if (previousSessionKey === undefined) {
    delete process.env.SESSION_KEY;
  } else {
    process.env.SESSION_KEY = previousSessionKey;
  }
});

function httpRequest(opts: { bearer?: string; cookieUserId?: string }): FastifyRequest {
  return {
    headers: opts.bearer === undefined ? {} : { authorization: `Bearer ${opts.bearer}` },
    session:
      opts.cookieUserId === undefined
        ? undefined
        : { get: (key: string) => (key === 'userId' ? opts.cookieUserId : undefined) },
  } as unknown as FastifyRequest;
}

function wsRequest(opts: { protocols?: string; cookieUserId?: string }): FastifyRequest {
  return {
    headers: opts.protocols === undefined ? {} : { 'sec-websocket-protocol': opts.protocols },
    session:
      opts.cookieUserId === undefined
        ? undefined
        : { get: (key: string) => (key === 'userId' ? opts.cookieUserId : undefined) },
  } as unknown as FastifyRequest;
}

describe('resolveUserId', () => {
  it('a valid bearer wins over the cookie', () => {
    const token = issueAuthToken('app-user', 'guest');
    expect(resolveUserId(httpRequest({ bearer: token, cookieUserId: 'cookie-user' }))).toBe(
      'app-user'
    );
  });

  it('an invalid bearer means signed out, never the cookie', () => {
    expect(resolveUserId(httpRequest({ bearer: 'garbage', cookieUserId: 'cookie-user' }))).toBe(
      null
    );
  });

  it('no bearer falls back to the cookie', () => {
    expect(resolveUserId(httpRequest({ cookieUserId: 'cookie-user' }))).toBe('cookie-user');
  });

  it('no bearer and no session means signed out', () => {
    expect(resolveUserId(httpRequest({}))).toBeNull();
  });

  it('reads the id as a plain property when the session has no get()', () => {
    const request = {
      headers: {},
      session: { userId: 'prop-user' },
    } as unknown as FastifyRequest;
    expect(resolveUserId(request)).toBe('prop-user');
  });
});

describe('resolveWsUserId', () => {
  it('reads the bearer entry out of the offered subprotocols', () => {
    const token = issueAuthToken('app-user', 'guest');
    const request = wsRequest({
      protocols: `${WS_PROTOCOL}, bearer.${token}`,
      cookieUserId: 'cookie-user',
    });
    expect(resolveWsUserId(request)).toBe('app-user');
  });

  it('an invalid bearer subprotocol means signed out, never the cookie', () => {
    const request = wsRequest({
      protocols: `${WS_PROTOCOL}, bearer.garbage`,
      cookieUserId: 'cookie-user',
    });
    expect(resolveWsUserId(request)).toBeNull();
  });

  it('no offered protocols falls back to the cookie (the website path)', () => {
    expect(resolveWsUserId(wsRequest({ cookieUserId: 'cookie-user' }))).toBe('cookie-user');
  });

  it('offered protocols without a bearer entry fall back to the cookie', () => {
    expect(
      resolveWsUserId(wsRequest({ protocols: WS_PROTOCOL, cookieUserId: 'cookie-user' }))
    ).toBe('cookie-user');
  });
});
