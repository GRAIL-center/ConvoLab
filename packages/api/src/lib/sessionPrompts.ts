/**
 * The persona and coach prompts a session runs with, before runtime additions.
 *
 * Shared by the text lanes (ws/conversation.ts) and voice mode
 * (voice/startSession.ts) so a spoken partner and a typed partner in the same
 * session are driven by the same persona.
 */
export interface SessionPromptSource {
  // Loose on purpose: scenarios come back from the Firestore shim untyped.
  scenario?: {
    partnerSystemPrompt?: unknown;
    coachSystemPrompt?: unknown;
    description?: unknown;
  } | null;
  customPartnerPrompt?: string | null;
  customCoachPrompt?: string | null;
}

export function resolveSessionPrompts(session: SessionPromptSource): {
  partner: string;
  coach: string;
} {
  const scenario = session.scenario;
  if (scenario) {
    return {
      partner: String(scenario.partnerSystemPrompt ?? scenario.description ?? ''),
      coach: String(scenario.coachSystemPrompt ?? scenario.description ?? ''),
    };
  }
  if (session.customPartnerPrompt && session.customCoachPrompt) {
    return { partner: session.customPartnerPrompt, coach: session.customCoachPrompt };
  }
  throw new Error('Session has neither scenario nor custom prompts');
}
