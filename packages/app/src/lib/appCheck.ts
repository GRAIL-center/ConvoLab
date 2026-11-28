import { isNativeApp, nativeAuthHeaders } from './authToken';

/**
 * Firebase App Check for the installed app (#243). reCAPTCHA cannot run inside
 * the app, so before a guest starts a practice conversation the app asks the
 * phone to vouch for it (App Attest on iPhone, Play Integrity on Android) and
 * sends the resulting token in the X-Firebase-AppCheck header; the server
 * checks it in packages/api/src/lib/appCheck.ts.
 *
 * On the website all of this is inert: isNativeApp() is false, nothing is
 * imported, and the tRPC headers are exactly nativeAuthHeaders() as before.
 * The plugin is loaded with a dynamic import, so neither it nor @capacitor/core
 * ends up in the website's main bundle.
 *
 * Until the native projects are wired up (see docs/app-check-setup.md;
 * capacitor.config.ts keeps the plugin out of `cap sync` for now) the native
 * plugin is not available and the app sends a placeholder token, the same way
 * the website sends 'local-dev' when it has no reCAPTCHA site key: a local API
 * without App Check configured accepts it, production refuses it.
 */

export const APP_CHECK_HEADER = 'X-Firebase-AppCheck';
const PLACEHOLDER_TOKEN = 'local-dev';

/** tRPC procedures that need an App Check token from the app. */
const APP_CHECK_PATHS = new Set(['practice.start']);

let initialized: Promise<void> | undefined;

async function getAppCheckToken(): Promise<string | undefined> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isPluginAvailable('FirebaseAppCheck')) return PLACEHOLDER_TOKEN;

  const { FirebaseAppCheck } = await import('@capacitor-firebase/app-check');
  // initialize() picks the attestation provider (App Attest / Play Integrity),
  // or the debug provider for simulator/emulator builds made with
  // VITE_APP_CHECK_DEBUG=1. It may only run once per app launch.
  initialized ??= FirebaseAppCheck.initialize({
    debugToken: import.meta.env.VITE_APP_CHECK_DEBUG === '1' ? true : undefined,
    isTokenAutoRefreshEnabled: true,
  }).catch((err: unknown) => {
    initialized = undefined; // let the next attempt retry
    throw err;
  });
  await initialized;
  const { token } = await FirebaseAppCheck.getToken({ forceRefresh: false });
  return token || undefined;
}

/**
 * Headers for one tRPC request. Inside the app, a batch that contains
 * practice.start also carries the App Check token. If no token can be had,
 * the header is left off and the server refuses the guest start (signed-in
 * accounts do not need it).
 */
export function trpcRequestHeaders(opts: {
  opList: ReadonlyArray<{ path: string }>;
}): Record<string, string> | Promise<Record<string, string>> {
  const base = nativeAuthHeaders();
  if (!isNativeApp() || !opts.opList.some((op) => APP_CHECK_PATHS.has(op.path))) return base;
  return getAppCheckToken().then(
    (token) => (token ? { ...base, [APP_CHECK_HEADER]: token } : base),
    (err: unknown) => {
      console.warn('[app-check] could not get a token', err);
      return base;
    }
  );
}
