import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Capacitor bridge and the App Check plugin are mocked: no device here.
const mocks = vi.hoisted(() => ({
  isPluginAvailable: vi.fn(),
  initialize: vi.fn(),
  getToken: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isPluginAvailable: mocks.isPluginAvailable },
}));
vi.mock('@capacitor-firebase/app-check', () => ({
  FirebaseAppCheck: { initialize: mocks.initialize, getToken: mocks.getToken },
}));

const START = { opList: [{ path: 'practice.start' }] };
const OTHER = { opList: [{ path: 'scenario.list' }] };

// Fresh module per test: the helper remembers that it initialized the plugin.
async function load() {
  vi.resetModules();
  return import('./appCheck');
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  mocks.isPluginAvailable.mockReset().mockReturnValue(true);
  mocks.initialize.mockReset().mockResolvedValue(undefined);
  mocks.getToken.mockReset().mockResolvedValue({ token: 'attested', expireTimeMillis: 0 });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('on the website (VITE_NATIVE unset)', () => {
  it('returns the same empty headers as before, synchronously, and never touches the plugin', async () => {
    const { trpcRequestHeaders } = await load();
    expect(trpcRequestHeaders(START)).toEqual({});
    expect(trpcRequestHeaders(OTHER)).toEqual({});
    expect(mocks.isPluginAvailable).not.toHaveBeenCalled();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });
});

describe('in the native app (VITE_NATIVE=1)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_NATIVE', '1');
  });

  it('leaves requests other than practice.start alone', async () => {
    const { trpcRequestHeaders } = await load();
    expect(trpcRequestHeaders(OTHER)).toEqual({ 'X-ConvoLab-Client': 'native' });
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it('adds the App Check token to practice.start and initializes the plugin once', async () => {
    const { trpcRequestHeaders } = await load();
    const expected = { 'X-ConvoLab-Client': 'native', 'X-Firebase-AppCheck': 'attested' };
    expect(await trpcRequestHeaders(START)).toEqual(expected);
    expect(await trpcRequestHeaders(START)).toEqual(expected);
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ debugToken: undefined })
    );
  });

  it('uses the debug provider in VITE_APP_CHECK_DEBUG=1 builds', async () => {
    vi.stubEnv('VITE_APP_CHECK_DEBUG', '1');
    const { trpcRequestHeaders } = await load();
    await trpcRequestHeaders(START);
    expect(mocks.initialize).toHaveBeenCalledWith(expect.objectContaining({ debugToken: true }));
  });

  it('sends the placeholder when the native plugin is not in this build', async () => {
    mocks.isPluginAvailable.mockReturnValue(false);
    const { trpcRequestHeaders } = await load();
    expect(await trpcRequestHeaders(START)).toEqual({
      'X-ConvoLab-Client': 'native',
      'X-Firebase-AppCheck': 'local-dev',
    });
    expect(mocks.initialize).not.toHaveBeenCalled();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it('leaves the header off when no token can be had (the server then refuses)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.getToken.mockRejectedValue(new Error('attestation failed'));
    const { trpcRequestHeaders } = await load();
    expect(await trpcRequestHeaders(START)).toEqual({ 'X-ConvoLab-Client': 'native' });
  });

  it('retries initialization after a failed attempt', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.initialize.mockRejectedValueOnce(new Error('not yet'));
    const { trpcRequestHeaders } = await load();
    expect(await trpcRequestHeaders(START)).toEqual({ 'X-ConvoLab-Client': 'native' });
    expect(await trpcRequestHeaders(START)).toMatchObject({ 'X-Firebase-AppCheck': 'attested' });
    expect(mocks.initialize).toHaveBeenCalledTimes(2);
  });
});
