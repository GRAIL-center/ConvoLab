import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';

// Server-side Firebase App Check verification (#243). Inside the installed
// iPhone/Android app reCAPTCHA cannot run, so the app proves it is the real,
// unmodified app on a real device (App Attest on iOS, Play Integrity on
// Android) and sends the resulting App Check token in the X-Firebase-AppCheck
// header. Structure mirrors recaptcha.ts: an outcome type, a pure decision
// function, and a verify wrapper that logs refusals.
//
// verifyToken checks the token's signature against Firebase's public keys and
// its audience against our project; it needs the project id, not a service
// account role. The app is initialized with Application Default Credentials
// (on Cloud Run, the runtime service account). See docs/app-check-setup.md.

/** Firebase / Google Cloud project the app's App Check tokens are issued for. */
export const DEFAULT_APP_CHECK_PROJECT_ID = 'convolab-490517';

/** Header the native app sends its App Check token in. */
export const APP_CHECK_HEADER = 'x-firebase-appcheck';

/** What happened when we tried to verify a token. */
export type AppCheckOutcome =
  // The request carried no token at all.
  | { kind: 'missing' }
  // Firebase accepted the token; appId is the Firebase app that obtained it.
  | { kind: 'verified'; appId: string }
  // Firebase refused the token (bad signature, wrong project, expired, garbage).
  | { kind: 'rejected'; code: string; detail: string }
  // Outside production with no APP_CHECK_PROJECT_ID, or the Admin SDK could not start.
  | { kind: 'unconfigured'; detail: string }
  // Anything else that went wrong while verifying (e.g. fetching Firebase's keys).
  | { kind: 'error'; detail: string };

export interface AppCheckDecision {
  verified: boolean;
  reason:
    | 'valid'
    | 'missing-token'
    | 'invalid-token'
    | 'unconfigured-dev-allow'
    | 'unconfigured'
    | 'error';
  appId?: string;
  code?: string;
  detail?: string;
}

/**
 * Pure decision: did this request come from our genuine app?
 *
 * - missing: always rejected, in dev as well as production (as recaptcha.ts's
 *   caller rejects a missing captcha token)
 * - verified: accepted
 * - rejected / error: always rejected (fail closed)
 * - unconfigured: allowed outside production (local dev), rejected in production
 */
export function decideAppCheck(outcome: AppCheckOutcome, isProduction: boolean): AppCheckDecision {
  switch (outcome.kind) {
    case 'missing':
      return { verified: false, reason: 'missing-token' };
    case 'verified':
      return { verified: true, reason: 'valid', appId: outcome.appId };
    case 'rejected':
      return {
        verified: false,
        reason: 'invalid-token',
        code: outcome.code,
        detail: outcome.detail,
      };
    case 'unconfigured':
      return isProduction
        ? { verified: false, reason: 'unconfigured', detail: outcome.detail }
        : { verified: true, reason: 'unconfigured-dev-allow', detail: outcome.detail };
    case 'error':
      return { verified: false, reason: 'error', detail: outcome.detail };
  }
}

// Error codes the Admin SDK uses when the token itself is bad, as opposed to
// a problem on our side. Both fail closed; the split only sharpens the logs.
const TOKEN_REJECTION_CODES = new Set([
  'app-check/invalid-argument',
  'app-check/app-check-token-expired',
]);

function firebaseAppFor(projectId: string) {
  // A named app per project, so this never collides with a default app that
  // other code might initialize later.
  const name = `convolab-app-check-${projectId}`;
  return (
    getApps().find((app) => app.name === name) ??
    initializeApp({ projectId, credential: applicationDefault() }, name)
  );
}

/** Verifies the token with the Firebase Admin SDK. Never throws; failures become outcomes. */
export async function assessAppCheckToken(
  token: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): Promise<AppCheckOutcome> {
  if (!token) return { kind: 'missing' };

  const isProduction = env.NODE_ENV === 'production';
  // Outside production, an unset APP_CHECK_PROJECT_ID means "not configured"
  // (as an unset RECAPTCHA_SITE_KEY does for reCAPTCHA), so a simulator build
  // pointed at a local API still works before Firebase is set up.
  if (!isProduction && !env.APP_CHECK_PROJECT_ID) {
    return { kind: 'unconfigured', detail: 'APP_CHECK_PROJECT_ID not set (non-production)' };
  }
  const projectId = env.APP_CHECK_PROJECT_ID || DEFAULT_APP_CHECK_PROJECT_ID;

  let appCheck: ReturnType<typeof getAppCheck>;
  try {
    appCheck = getAppCheck(firebaseAppFor(projectId));
  } catch (err) {
    return {
      kind: 'unconfigured',
      detail: `firebase-admin init failed: ${(err as Error).message}`,
    };
  }

  try {
    const result = await appCheck.verifyToken(token);
    return { kind: 'verified', appId: result.appId };
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    const detail = (err as Error).message ?? String(err);
    if (typeof code === 'string' && TOKEN_REJECTION_CODES.has(code)) {
      return { kind: 'rejected', code, detail };
    }
    return { kind: 'error', detail: typeof code === 'string' ? `${code}: ${detail}` : detail };
  }
}

interface WarnLogger {
  warn: (obj: object, msg: string) => void;
}

/** Verify and decide; logs at warn (never the token) when not verified. */
export async function verifyAppCheck(
  token: string | undefined,
  log: WarnLogger,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  const outcome = await assessAppCheckToken(token, env);
  const decision = decideAppCheck(outcome, env.NODE_ENV === 'production');
  if (!decision.verified) {
    log.warn(
      {
        event: 'app_check_rejected',
        reason: decision.reason,
        code: decision.code ?? null,
        detail: decision.detail ?? null,
      },
      '[app-check] token not verified'
    );
  }
  return decision.verified;
}
