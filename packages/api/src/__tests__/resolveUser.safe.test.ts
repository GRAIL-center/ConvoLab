import type { FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type RoleLookup,
  resolveUserId as resolveUserIdWith,
  resolveWsUserId as resolveWsUserIdWith,
  WS_PROTOCOL,
} from '../auth/resolveUser.js';
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

// Existing tests: every token's user is still a guest.
const stillGuest: RoleLookup = async () => 'GUEST';
const resolveUserId = (request: FastifyRequest) => resolveUserIdWith(request, stillGuest);
const resolveWsUserId = (request: FastifyRequest) => resolveWsUserIdWith(request, stillGuest);

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
  it('a valid bearer wins over the cookie', async () => {
    const token = issueAuthToken('app-user', 'guest');
    expect(await resolveUserId(httpRequest({ bearer: token, cookieUserId: 'cookie-user' }))).toBe(
      'app-user'
    );
  });

  it('an invalid bearer means signed out, never the cookie', async () => {
    expect(
      await resolveUserId(httpRequest({ bearer: 'garbage', cookieUserId: 'cookie-user' }))
    ).toBe(null);
  });

  it('no bearer falls back to the cookie', async () => {
    expect(await resolveUserId(httpRequest({ cookieUserId: 'cookie-user' }))).toBe('cookie-user');
  });

  it('no bearer and no session means signed out', async () => {
    expect(await resolveUserId(httpRequest({}))).toBeNull();
  });

  it('reads the id as a plain property when the session has no get()', async () => {
    const request = {
      headers: {},
      session: { userId: 'prop-user' },
    } as unknown as FastifyRequest;
    expect(await resolveUserId(request)).toBe('prop-user');
  });
});

describe('resolveWsUserId', () => {
  it('reads the bearer entry out of the offered subprotocols', async () => {
    const token = issueAuthToken('app-user', 'guest');
    const request = wsRequest({
      protocols: `${WS_PROTOCOL}, bearer.${token}`,
      cookieUserId: 'cookie-user',
    });
    expect(await resolveWsUserId(request)).toBe('app-user');
  });

  it('an invalid bearer subprotocol means signed out, never the cookie', async () => {
    const request = wsRequest({
      protocols: `${WS_PROTOCOL}, bearer.garbage`,
      cookieUserId: 'cookie-user',
    });
    expect(await resolveWsUserId(request)).toBeNull();
  });

  it('no offered protocols falls back to the cookie (the website path)', async () => {
    expect(await resolveWsUserId(wsRequest({ cookieUserId: 'cookie-user' }))).toBe('cookie-user');
  });

  it('offered protocols without a bearer entry fall back to the cookie', async () => {
    expect(
      await resolveWsUserId(wsRequest({ protocols: WS_PROTOCOL, cookieUserId: 'cookie-user' }))
    ).toBe('cookie-user');
  });
});

describe('guest tokens after the guest becomes an account (#244)', () => {
  it('a guest token stops working once its user is no longer a guest', async () => {
    const token = issueAuthToken('upgraded-user', 'guest');
    const upgraded: RoleLookup = async () => 'USER';
    expect(await resolveUserIdWith(httpRequest({ bearer: token }), upgraded)).toBeNull();
    expect(
      await resolveWsUserIdWith(
        wsRequest({ protocols: `${WS_PROTOCOL}, bearer.${token}` }),
        upgraded
      )
    ).toBeNull();
  });

  it('a guest token for a deleted user is signed out', async () => {
    const token = issueAuthToken('gone-user', 'guest');
    const gone: RoleLookup = async () => null;
    expect(await resolveUserIdWith(httpRequest({ bearer: token }), gone)).toBeNull();
  });

  it('account tokens are not looked up at all', async () => {
    const token = issueAuthToken('account-user', 'account');
    const mustNotBeCalled: RoleLookup = async () => {
      throw new Error('account tokens must not trigger a role lookup');
    };
    expect(await resolveUserIdWith(httpRequest({ bearer: token }), mustNotBeCalled)).toBe(
      'account-user'
    );
  });
});
