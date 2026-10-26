/**
 * Server-pinned voice configuration. Nothing here is chosen by the client.
 *
 * Voice matching: one voice per partner gender, shared across ideologies, so
 * ideology is the only thing that differs between the left and right arms of
 * the same gender. The names below are PLACEHOLDERS pending research-team
 * approval of the four persona-to-voice assignments; changing one changes
 * VOICE_CONFIG_VERSION, which is stamped on every stored voice turn.
 */
import { createHash } from 'node:crypto';

export type VoicePartnerGender = 'male' | 'female';

/** Gemini Live prebuilt voice per partner gender. Placeholders: not yet approved. */
export const PARTNER_VOICE_BY_GENDER: Record<VoicePartnerGender, string> = {
  male: 'Charon',
  female: 'Kore',
};

/** Fallback when the session has no known partner gender (e.g. custom scenarios). */
const DEFAULT_VOICE = PARTNER_VOICE_BY_GENDER.female;

/**
 * Live model. Override with VOICE_PARTNER_MODEL; probe that the key actually
 * has access before a pilot, since Live model ids churn faster than text ones.
 */
export function voicePartnerModel(): string {
  return process.env.VOICE_PARTNER_MODEL?.trim() || 'gemini-2.5-flash-native-audio-preview-09-2025';
}

/** Bump on any change to how the voice session is configured (not the persona prompt; that is hashed). */
export const VOICE_CONFIG_VERSION = 'voice-v1-2026-10-17';

export function voiceForGender(gender: unknown): string {
  return gender === 'male' || gender === 'female' ? PARTNER_VOICE_BY_GENDER[gender] : DEFAULT_VOICE;
}

/** Short stable hash so a stored turn records exactly which prompt produced it without copying the prompt. */
export function promptHash(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 16);
}

/** `config@model@voice@prompt-hash`. The client echoes it on each exchange. */
export function voiceSessionVersion(args: {
  model: string;
  voiceName: string;
  systemPrompt: string;
}): string {
  return [VOICE_CONFIG_VERSION, args.model, args.voiceName, promptHash(args.systemPrompt)].join(
    '@'
  );
}

/**
 * Ephemeral tokens exist only on the Gemini Developer API, not Vertex. Text
 * lanes may run on Vertex in production, so voice reads its own key first.
 */
export function voiceApiKey(): string | undefined {
  return (
    process.env.GEMINI_LIVE_API_KEY?.trim() || process.env.GOOGLE_AI_API_KEY?.trim() || undefined
  );
}
