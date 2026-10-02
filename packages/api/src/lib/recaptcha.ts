import { GoogleAuth } from 'google-auth-library';

// Server-side reCAPTCHA verification via the reCAPTCHA Enterprise assessment
// API (console: Google Cloud "reCAPTCHA" / "Fraud Defense"). Keys created in
// the Cloud console have no legacy secret, so instead of the old siteverify
// endpoint + RECAPTCHA_SECRET_KEY this authenticates with Application Default
// Credentials: on Cloud Run that is the runtime service account, which needs
// roles/recaptchaenterprise.agent. See docs/recaptcha-setup.md.

/**
 * Public site key of the production key in project convolab-490517 (type
 * Website / checkbox; domains convolab.us, www.convolab.us, localhost). It is
 * not a secret: the same value is inlined into the frontend bundle as
 * VITE_RECAPTCHA_SITE_KEY. Used when RECAPTCHA_SITE_KEY is unset so production
 * works without a new env var; set RECAPTCHA_SITE_KEY to override it.
 */
export const DEFAULT_RECAPTCHA_SITE_KEY = '6LcMwdstAAAAADFzrXQskk2v5dAMzQ52931gX6Tk';

/** Minimum riskAnalysis.score accepted when the assessment returns one. */
export const MIN_RECAPTCHA_SCORE = 0.5;

/** The subset of the Enterprise Assessment resource this code reads. */
export interface RecaptchaAssessment {
  tokenProperties?: { valid?: boolean; invalidReason?: string; action?: string };
  riskAnalysis?: { score?: number; reasons?: string[] };
}

/** What happened when we tried to get an assessment for a token. */
export type RecaptchaOutcome =
  | { kind: 'assessment'; assessment: RecaptchaAssessment }
  // No ADC, no project id, or (outside production) no RECAPTCHA_SITE_KEY.
  | { kind: 'unconfigured'; detail: string }
  // Credentials were available but the call failed (network, HTTP error, bad JSON).
  | { kind: 'error'; detail: string };

export interface RecaptchaDecision {
  verified: boolean;
  reason:
    | 'valid'
    | 'invalid-token'
    | 'low-score'
    | 'unconfigured-dev-allow'
    | 'unconfigured'
    | 'error';
  invalidReason?: string;
  score?: number;
  detail?: string;
}

/**
 * Pure decision: is this outcome a verified human?
 *
 * - assessment: valid token AND (no score, as for checkbox keys, OR score >= 0.5)
 * - unconfigured: allowed outside production (local dev without ADC), rejected in production
 * - error: always rejected (fail closed)
 */
export function decideRecaptcha(
  outcome: RecaptchaOutcome,
  isProduction: boolean
): RecaptchaDecision {
  if (outcome.kind === 'unconfigured') {
    return isProduction
      ? { verified: false, reason: 'unconfigured', detail: outcome.detail }
      : { verified: true, reason: 'unconfigured-dev-allow', detail: outcome.detail };
  }
  if (outcome.kind === 'error') {
    return { verified: false, reason: 'error', detail: outcome.detail };
  }

  const { tokenProperties, riskAnalysis } = outcome.assessment;
  const score = riskAnalysis?.score;
  if (tokenProperties?.valid !== true) {
    return {
      verified: false,
      reason: 'invalid-token',
      invalidReason: tokenProperties?.invalidReason,
      score,
    };
  }
  if (typeof score === 'number' && score < MIN_RECAPTCHA_SCORE) {
    return { verified: false, reason: 'low-score', score };
  }
  return { verified: true, reason: 'valid', score };
}

let auth: GoogleAuth | undefined;
function getAuth(): GoogleAuth {
  auth ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  return auth;
}

/** Calls projects.assessments.create. Never throws; failures become outcomes. */
export async function assessRecaptchaToken(
  token: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<RecaptchaOutcome> {
  const isProduction = env.NODE_ENV === 'production';
  // Outside production, an unset RECAPTCHA_SITE_KEY means "not configured"
  // (as an unset RECAPTCHA_SECRET_KEY did before): local Docker mounts the
  // developer's ADC, and the frontend sends a placeholder token when it has no
  // site key, so verifying would block local /practice for no benefit.
  if (!isProduction && !env.RECAPTCHA_SITE_KEY) {
    return { kind: 'unconfigured', detail: 'RECAPTCHA_SITE_KEY not set (non-production)' };
  }
  const siteKey = env.RECAPTCHA_SITE_KEY || DEFAULT_RECAPTCHA_SITE_KEY;
  const project = env.GOOGLE_CLOUD_PROJECT || env.FIRESTORE_PROJECT_ID;
  if (!project) {
    return { kind: 'unconfigured', detail: 'GOOGLE_CLOUD_PROJECT / FIRESTORE_PROJECT_ID not set' };
  }

  let accessToken: string | null | undefined;
  try {
    accessToken = await getAuth().getAccessToken();
  } catch (err) {
    return { kind: 'unconfigured', detail: `no credentials: ${(err as Error).message}` };
  }
  if (!accessToken) {
    return { kind: 'unconfigured', detail: 'no credentials: empty access token' };
  }

  try {
    const res = await fetch(
      `https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(project)}/assessments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        // expectedAction is omitted: checkbox keys carry no action.
        body: JSON.stringify({ event: { token, siteKey } }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { kind: 'error', detail: `HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    return { kind: 'assessment', assessment: (await res.json()) as RecaptchaAssessment };
  } catch (err) {
    return { kind: 'error', detail: (err as Error).message };
  }
}

interface WarnLogger {
  warn: (obj: object, msg: string) => void;
}

/** Assess the token and decide; logs at warn (never the token) when not verified. */
export async function verifyRecaptcha(
  token: string,
  log: WarnLogger,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  const outcome = await assessRecaptchaToken(token, env);
  const decision = decideRecaptcha(outcome, env.NODE_ENV === 'production');
  if (!decision.verified) {
    log.warn(
      {
        event: 'recaptcha_rejected',
        reason: decision.reason,
        invalidReason: decision.invalidReason ?? null,
        score: decision.score ?? null,
        detail: decision.detail ?? null,
      },
      '[recaptcha] token not verified'
    );
  }
  return decision.verified;
}
