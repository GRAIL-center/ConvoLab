/**
 * Which model each stream of a conversation runs on.
 *
 * This is the single place that decides the partner, coach and live-scorer
 * models. The WebSocket handler uses it at runtime and the study router uses
 * it to snapshot the models onto a study session at creation, so the model a
 * transcript says it ran on and the model it actually ran on cannot drift
 * apart (pre-analysis plan: the archive must say which model produced each
 * transcript).
 *
 * Pure: the environment and the provider availability are passed in, so it is
 * testable without touching process.env.
 */

export const DEFAULT_GOOGLE_MODEL = 'google:gemini-2.5-flash';

// Study conversation partner pinned to Claude Sonnet (PAP v7.8; Hanna 9 Aug 2026).
// With a Claude default here, resolveConfiguredModel no longer silently falls back
// to Gemini for the partner — the partner REQUIRES ANTHROPIC_API_KEY to be set.
export const DEFAULT_PARTNER_MODEL = 'claude-sonnet-5';

/** The environment variables that change model selection. */
export interface ModelEnv {
  COACH_MODEL?: string;
  LAPP_SCORER_MODEL?: string;
}

/** Which LLM providers have credentials configured. */
export interface ProviderAvailability {
  anthropic: boolean;
  google: boolean;
}

/** The scenario fields that carry a model choice. */
export interface ScenarioModels {
  partnerModel?: string | null;
  coachModel?: string | null;
}

export interface SessionModels {
  partner: string;
  coach: string;
  scorer: string;
}

// Overridable for the same reason LAPP_SCORER_MODEL is: the coach and the
// scorer both ride Google while the partner is pinned to Claude, so an exhausted
// Google key silently removes coaching and scoring from a session that still
// looks healthy because the partner keeps replying. Unset, behaviour is
// unchanged.
// `||`, not `??`: compose passes these through as `${VAR:-}`, so "unset" arrives
// as an empty string, which `??` would happily accept as the model name.
export function defaultCoachModel(env: ModelEnv): string {
  return env.COACH_MODEL || DEFAULT_GOOGLE_MODEL;
}

export function defaultScorerModel(env: ModelEnv): string {
  return env.LAPP_SCORER_MODEL || DEFAULT_GOOGLE_MODEL;
}

export function isAnthropicModel(modelString: string): boolean {
  return modelString.startsWith('anthropic:') || modelString.startsWith('claude');
}

/**
 * A Claude model with no Anthropic key but a Google one falls back to
 * `fallbackModel`; anything else runs as configured.
 */
export function resolveConfiguredModel(
  modelString: string,
  fallbackModel: string,
  providers: ProviderAvailability
): string {
  if (isAnthropicModel(modelString) && !providers.anthropic && providers.google) {
    return fallbackModel;
  }
  return modelString;
}

/**
 * The partner, coach and scorer models for a session.
 *
 * A session with a scenario uses the scenario's partnerModel/coachModel when
 * set. A session without one (custom sessions, and every study session: those
 * snapshot the scenario's prompts but carry no scenarioId) uses the defaults.
 */
export function resolveSessionModels(args: {
  scenario: ScenarioModels | null | undefined;
  env: ModelEnv;
  providers: ProviderAvailability;
}): SessionModels {
  const { scenario, env, providers } = args;
  const coachDefault = defaultCoachModel(env);
  const scorerDefault = defaultScorerModel(env);
  return {
    partner: resolveConfiguredModel(
      scenario?.partnerModel ?? DEFAULT_PARTNER_MODEL,
      DEFAULT_PARTNER_MODEL,
      providers
    ),
    coach: resolveConfiguredModel(scenario?.coachModel ?? coachDefault, coachDefault, providers),
    scorer: resolveConfiguredModel(scorerDefault, scorerDefault, providers),
  };
}

/** Provider availability from the process environment. */
export function providersFromEnv(env: NodeJS.ProcessEnv): ProviderAvailability {
  return {
    anthropic: !!env.ANTHROPIC_API_KEY,
    google: !!env.GOOGLE_CLOUD_PROJECT || !!env.GOOGLE_AI_API_KEY,
  };
}
