/**
 * Which web origins may call the API from a browser (#238).
 *
 * The website is served from FRONTEND_URL, so that is its one origin. The
 * installed app bundles its pages and serves them from a local origin chosen by
 * Capacitor, not from convolab.us:
 *
 *   - iPhone:  capacitor://localhost
 *   - Android: https://localhost
 *
 * Without these two, the phone's web view refuses every tRPC response and the
 * app cannot load anything. The app signs in with a bearer token, not the
 * session cookie (lib/authToken.ts), and the cookie is SameSite=Lax, so a page
 * on someone's own https://localhost still cannot ride a convolab.us session.
 *
 * WebSockets are not covered by CORS, and the conversation socket does not
 * check the Origin header, so the app's socket needs nothing here.
 */
export const APP_ORIGINS = ['capacitor://localhost', 'https://localhost'] as const;

const LOCAL_DEV_FRONTEND = 'http://localhost:5173';

export function corsOrigins(frontendUrl: string | undefined): string[] {
  return [frontendUrl || LOCAL_DEV_FRONTEND, ...APP_ORIGINS];
}
