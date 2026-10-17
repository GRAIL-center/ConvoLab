/**
 * Mint a Gemini Live grant for one conversation session.
 *
 * The browser connects to Gemini Live itself with a short-lived ephemeral
 * token. Everything that defines the study condition (model, voice, persona
 * prompt, transcription, search) is set here and locked into the token, so the
 * client cannot change it. Our long-lived API key never leaves the server.
 */
import { GoogleGenAI, type LiveConnectConfig, Modality } from '@google/genai';
import { personaFromScenarioSlug } from '../lib/conversationIntro.js';
import { buildPartnerSystemPrompt } from '../lib/partnerRuntimePrompt.js';
import { resolveSessionPrompts, type SessionPromptSource } from '../lib/sessionPrompts.js';
import type { VoiceSessionGrant } from './contract.js';
import {
  voiceApiKey,
  voiceForGender,
  voicePartnerModel,
  voiceSessionVersion,
} from './voiceConfig.js';

/** A fresh Live session must be opened within this window. */
const NEW_SESSION_WINDOW_MS = 60_000;
/** Messages on the session stop being accepted after this; the client asks for a new grant to continue. */
const TOKEN_LIFETIME_MS = 30 * 60_000;

/** Kept short: the transcript can grow and it all goes into the system instruction. */
const MAX_HISTORY_TURNS = 40;

export const VOICE_SPOKEN_STYLE = `SPOKEN CONVERSATION:
- This conversation is spoken aloud. Everything you say is turned into speech.
- Talk the way people talk out loud. No lists, headings, markdown, links or emoji.
- If you are interrupted, stop and respond to what the other person just said. Do not repeat what you were saying before.`;

export interface VoiceSessionSource extends SessionPromptSource {
  studyPartnerGender?: string | null;
  scenario?:
    | (NonNullable<SessionPromptSource['scenario']> & {
        slug?: unknown;
        partnerUseWebSearch?: unknown;
      })
    | null;
  studyPartnerUseWebSearch?: boolean | null;
}

export interface HistoryTurn {
  role: string;
  content: string;
  messageType?: string | null;
}

/** Gender for the voice: study sessions carry it; public partisan scenarios encode it in the slug. */
export function partnerGender(session: VoiceSessionSource): 'male' | 'female' | null {
  const g = session.studyPartnerGender;
  if (g === 'male' || g === 'female') return g;
  const slug = session.scenario?.slug;
  return personaFromScenarioSlug(typeof slug === 'string' ? slug : null)?.gender ?? null;
}

/**
 * Persona prompt plus runtime context, then the spoken-style rules, then the
 * conversation so far. History goes in the instruction rather than being sent
 * by the client, so a reconnect or a switch from text to voice resumes the
 * same conversation from our record, not from whatever the browser holds.
 */
export function buildVoiceSystemInstruction(
  session: VoiceSessionSource,
  history: HistoryTurn[],
  now: Date = new Date()
): string {
  const base = buildPartnerSystemPrompt(resolveSessionPrompts(session).partner, now);
  const turns = history
    .filter(
      (m) =>
        (m.messageType ?? 'main') === 'main' &&
        (m.role === 'user' || m.role === 'partner') &&
        m.content.trim().length > 0
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => `${m.role === 'user' ? 'Them' : 'You'}: ${m.content.trim()}`);

  const sections = [base, VOICE_SPOKEN_STYLE];
  if (turns.length > 0) {
    sections.push(
      `CONVERSATION SO FAR (continue from here; do not repeat or summarise it):\n${turns.join('\n')}`
    );
  }
  return sections.join('\n\n');
}

export function buildLiveConfig(args: {
  systemInstruction: string;
  voiceName: string;
  useWebSearch: boolean;
}): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: { parts: [{ text: args.systemInstruction }] },
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: args.voiceName } } },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: {},
    contextWindowCompression: { slidingWindow: {} },
    ...(args.useWebSearch ? { tools: [{ googleSearch: {} }] } : {}),
  };
}

export type TokenMinter = (args: {
  model: string;
  config: LiveConnectConfig;
  newSessionExpireTime: string;
  expireTime: string;
}) => Promise<string>;

/** Real minter. `lockAdditionalFields: []` locks every field set in the constraints. */
export const geminiTokenMinter: TokenMinter = async ({
  model,
  config,
  newSessionExpireTime,
  expireTime,
}) => {
  const apiKey = voiceApiKey();
  if (!apiKey) {
    throw new Error(
      'Voice mode needs GEMINI_LIVE_API_KEY or GOOGLE_AI_API_KEY (ephemeral tokens are not available on Vertex)'
    );
  }
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      newSessionExpireTime,
      expireTime,
      liveConnectConstraints: { model, config },
      lockAdditionalFields: [],
    },
  });
  if (!token.name) throw new Error('Gemini returned an ephemeral token with no name');
  return token.name;
};

export async function createVoiceGrant(
  session: VoiceSessionSource,
  history: HistoryTurn[],
  options: { mint?: TokenMinter; now?: Date } = {}
): Promise<VoiceSessionGrant & { voiceName: string }> {
  const now = options.now ?? new Date();
  const mint = options.mint ?? geminiTokenMinter;

  const model = voicePartnerModel();
  const voiceName = voiceForGender(partnerGender(session));
  const systemInstruction = buildVoiceSystemInstruction(session, history, now);
  const useWebSearch = session.scenario
    ? session.scenario.partnerUseWebSearch === true
    : session.studyPartnerUseWebSearch === true;

  const newSessionExpiresAt = new Date(now.getTime() + NEW_SESSION_WINDOW_MS).toISOString();
  const expiresAt = new Date(now.getTime() + TOKEN_LIFETIME_MS).toISOString();
  const token = await mint({
    model,
    config: buildLiveConfig({ systemInstruction, voiceName, useWebSearch }),
    newSessionExpireTime: newSessionExpiresAt,
    expireTime: expiresAt,
  });

  return {
    token,
    // The SDK's live.connect takes the bare id; the token locks the same one.
    model,
    newSessionExpiresAt,
    expiresAt,
    voiceSessionVersion: voiceSessionVersion({
      model,
      voiceName,
      // Hash the persona, not the history: the version should identify the
      // condition, and history changes every turn.
      systemPrompt: resolveSessionPrompts(session).partner,
    }),
    voiceName,
  };
}
