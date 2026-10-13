import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAuthToken,
  completeNativeSignIn,
  getAuthToken,
  isNativeApp,
  nativeAuthHeaders,
  setAuthToken,
  startNativeSignIn,
  wsProtocols,
} from './authToken';

function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeLocalStorage());
  clearAuthToken();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('on the website (VITE_NATIVE unset)', () => {
  it('is inert: no native flag, empty headers, no subprotocols', () => {
    expect(isNativeApp()).toBe(false);
    setAuthToken('t');
    expect(nativeAuthHeaders()).toEqual({});
    expect(wsProtocols()).toBeUndefined();
  });
});

describe('in the native app (VITE_NATIVE=1)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_NATIVE', '1');
  });

  it('stores, returns and clears the token', () => {
    expect(getAuthToken()).toBeNull();
    setAuthToken('token-1');
    expect(getAuthToken()).toBe('token-1');
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
  });

  it('sends the client header always, the bearer only with a token', () => {
    expect(nativeAuthHeaders()).toEqual({ 'X-ConvoLab-Client': 'native' });
    setAuthToken('token-1');
    expect(nativeAuthHeaders()).toEqual({
      'X-ConvoLab-Client': 'native',
      Authorization: 'Bearer token-1',
    });
  });

  it('offers socket subprotocols only when a token exists', () => {
    expect(wsProtocols()).toBeUndefined();
    setAuthToken('token-1');
    expect(wsProtocols()).toEqual(['convolab.v1', 'bearer.token-1']);
  });

  it('runs the PKCE round trip: challenge matches verifier, token stored', async () => {
    const calls: Array<{ url: string; body: Record<string, string> }> = [];
    vi.stubGlobal('window', { open: vi.fn() });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options: { body: string }) => {
        const body = JSON.parse(options.body) as Record<string, string>;
        calls.push({ url: String(url), body });
        return {
          ok: true,
          json: async () =>
            String(url).includes('/start')
              ? { ticketId: 'ticket-1' }
              : { authToken: 'account-token' },
        };
      })
    );

    await startNativeSignIn();
    const ok = await completeNativeSignIn('convolab://auth/callback?code=code-1');
    expect(ok).toBe(true);
    expect(getAuthToken()).toBe('account-token');

    // The verifier sent to /token hashes to the challenge sent to /start.
    const challenge = calls[0].body.codeChallenge;
    const verifier = calls[1].body.codeVerifier;
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(challenge);
    expect(calls[1].body.code).toBe('code-1');
  });

  it('refuses a callback with an error or with no pending sign-in', async () => {
    expect(await completeNativeSignIn('convolab://auth/callback?error=ticket_invalid')).toBe(false);
    expect(await completeNativeSignIn('convolab://auth/callback?code=c')).toBe(false);
    expect(getAuthToken()).toBeNull();
  });
});
