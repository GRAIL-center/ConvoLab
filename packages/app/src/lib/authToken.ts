import { apiUrl } from './apiUrl';

/**
 * Native-app auth (plan 18, step 6). Inside the installed app the website's
 * session cookie does not exist, so the app holds a bearer token and sends it
 * with every request; on the website all of this is inert and nothing changes.
 *
 * Storage is localStorage behind this small interface for now.
 * PHASE 3: swap the three storage functions to secure native storage
 * (Keychain / Keystore via a Capacitor plugin), and switch isNativeApp() to
 * Capacitor's own platform check.
 */

const STORAGE_KEY = 'convolab.authToken';

export function isNativeApp(): boolean {
  // PHASE 3: return Capacitor.isNativePlatform()
  return import.meta.env.VITE_NATIVE === '1';
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Storage unavailable: the user stays a per-launch guest.
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Headers for API requests. Outside the native app this is {}, so spreading it
 * into a request changes nothing on the website.
 */
export function nativeAuthHeaders(): Record<string, string> {
  if (!isNativeApp()) return {};
  const headers: Record<string, string> = { 'X-ConvoLab-Client': 'native' };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Subprotocols for the conversation/observer sockets. Browsers cannot add
 * headers to a WebSocket, so the token rides in the subprotocol list the
 * server's handleProtocols answers (plan 18, step 3). Undefined on the web,
 * so `new WebSocket(url, wsProtocols())` is byte-identical to today there.
 */
export function wsProtocols(): string[] | undefined {
  if (!isNativeApp()) return undefined;
  const token = getAuthToken();
  return token ? ['convolab.v1', `bearer.${token}`] : undefined;
}

// ---------------------------------------------------------------------------
// Native Google sign-in (PKCE; server half in routes/nativeAuth.ts)
// ---------------------------------------------------------------------------

// The verifier only ever lives in memory, never in storage or a URL.
let pendingCodeVerifier: string | null = null;

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Base64url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return base64url(digest);
}

function openSystemBrowser(url: string): void {
  // PHASE 3: Capacitor Browser plugin — await Browser.open({ url }).
  window.open(url, '_blank', 'noopener');
}

/**
 * Starts Google sign-in from the app: creates a PKCE verifier (kept in
 * memory), asks the API for a ticket, and opens the phone's real browser at
 * the Google start route. The flow completes when the convolab:// deep link
 * comes back and completeNativeSignIn() redeems the one-time code.
 */
export async function startNativeSignIn(): Promise<void> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  pendingCodeVerifier = verifier;
  const codeChallenge = await sha256Base64url(verifier);

  const start = () =>
    fetch(apiUrl('/api/auth/native/start'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...nativeAuthHeaders() },
      body: JSON.stringify({ codeChallenge }),
    });

  let response = await start();
  if ((response.status === 401 || response.status === 400) && getAuthToken()) {
    // The stored token is stale (expired, or the key rotated) or not a guest
    // token. Signing in replaces it anyway, so drop it and retry once without
    // it; otherwise a dead token would block sign-in forever.
    clearAuthToken();
    response = await start();
  }
  if (!response.ok) {
    pendingCodeVerifier = null;
    throw new Error(`Native sign-in start failed (${response.status})`);
  }
  const { ticketId } = (await response.json()) as { ticketId: string };
  openSystemBrowser(apiUrl(`/api/auth/google?native=${encodeURIComponent(ticketId)}`));
}

/**
 * Redeems the one-time code from the convolab://auth/callback deep link and
 * stores the account token. Returns true on success, false when the link
 * carried an error or no sign-in was pending.
 *
 * PHASE 3: call this from the Capacitor App plugin's appUrlOpen handler:
 *   App.addListener('appUrlOpen', ({ url }) => {
 *     if (url.startsWith('convolab://auth/callback')) void completeNativeSignIn(url);
 *   });
 */
export async function completeNativeSignIn(callbackUrl: string): Promise<boolean> {
  // convolab:// does not parse as a URL in every runtime; swap the scheme.
  const parsed = new URL(callbackUrl.replace(/^convolab:\/\//, 'https://native.invalid/'));
  const code = parsed.searchParams.get('code');
  const verifier = pendingCodeVerifier;
  pendingCodeVerifier = null;
  if (!code || !verifier || parsed.searchParams.get('error')) return false;

  const response = await fetch(apiUrl('/api/auth/native/token'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier: verifier }),
  });
  if (!response.ok) return false;
  const { authToken } = (await response.json()) as { authToken: string };
  setAuthToken(authToken);
  return true;
}

/** Sign out in the app: tell the server (bearer, so guest unclaim works), drop the token. */
export async function nativeSignOut(): Promise<void> {
  try {
    await fetch(apiUrl('/api/auth/logout'), { method: 'POST', headers: nativeAuthHeaders() });
  } finally {
    clearAuthToken();
  }
}
