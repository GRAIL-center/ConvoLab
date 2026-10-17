/**
 * Voice mode: the contract between the browser voice client and ConvoLab.
 *
 * The browser talks to Gemini Live directly (audio never touches our server)
 * and reports each finished exchange here over the existing conversation
 * WebSocket as a `voice:exchange` message. ConvoLab persists it, then runs the
 * coach and LAPP exactly as for a typed exchange. Anything that can produce a
 * VoiceExchange (direct Gemini Live today, Pipecat later, a test fixture) plugs
 * in without the study side changing.
 *
 * The app imports these types the same way it imports AppRouter:
 *   import type { VoiceExchange } from '@workspace/api/src/voice/contract';
 * Only change this file by agreement: both tracks build against it.
 */
import { z } from 'zod';

/** What the participant sees as the connection state. Purely client-side; listed so both sides use the same names. */
export type VoiceState =
  | 'connecting'
  | 'listening'
  | 'participant_speaking'
  | 'partner_thinking'
  | 'partner_speaking'
  | 'muted'
  | 'reconnecting'
  | 'disconnected';

const MAX_TURN_CHARS = 10_000;
const isoTimestamp = z.iso.datetime({ offset: true });

const participantTurnSchema = z.object({
  /** Final input transcription. Never a partial. */
  transcript: z.string().trim().min(1).max(MAX_TURN_CHARS),
  startedAt: isoTimestamp,
  endedAt: isoTimestamp,
});

const partnerTurnSchema = z.object({
  /**
   * What the participant actually heard. This is the conversation of record:
   * it is what gets stored as the partner message and what the coach, LAPP
   * and DQI see. When interrupted, it is the prefix of `generatedText` that
   * had played before playback stopped.
   */
  deliveredText: z.string().trim().max(MAX_TURN_CHARS),
  /** Everything Gemini produced for this turn. Diagnostic only; kept in metadata. */
  generatedText: z.string().max(MAX_TURN_CHARS),
  interrupted: z.boolean(),
  /** True only when the whole response played out. */
  playbackCompleted: z.boolean(),
  /** Milliseconds of partner audio played before it stopped. */
  playedMs: z.number().int().nonnegative().optional(),
  startedAt: isoTimestamp,
  endedAt: isoTimestamp,
});

export const voiceExchangeSchema = z.object({
  /**
   * Client-generated, unique per exchange within the session (a UUID). It is
   * the idempotency key: resending the same exchange after a reconnect stores
   * nothing new. Never reuse one for a different exchange.
   */
  exchangeId: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  participant: participantTurnSchema,
  partner: partnerTurnSchema,
  /** Echo of `voiceSessionVersion` from voice.startSession, so we can tell which config produced the turn. */
  voiceSessionVersion: z.string().min(1).max(200),
});

export type VoiceExchange = z.infer<typeof voiceExchangeSchema>;

/** Client -> server, over /ws/conversation/:sessionId. */
export interface VoiceExchangeClientMessage {
  type: 'voice:exchange';
  exchange: VoiceExchange;
}

/** Client -> server: operational events for monitoring. No transcript content. */
export interface VoiceStatusClientMessage {
  type: 'voice:status';
  event: VoiceStatusEvent;
}

export const voiceStatusEventSchema = z.object({
  kind: z.enum([
    'started',
    'reconnecting',
    'reconnected',
    'mic_denied',
    'mic_lost',
    'provider_error',
    'fell_back_to_text',
    'ended',
  ]),
  /** Short machine-readable reason, e.g. a Gemini close code. No transcript text. */
  detail: z.string().max(200).optional(),
});

export type VoiceStatusEvent = z.infer<typeof voiceStatusEventSchema>;

/** Server -> client: the exchange is stored. Safe to drop it from any client retry queue. */
export interface VoiceExchangeAckServerMessage {
  type: 'voice:exchange:ack';
  exchangeId: string;
  userMessageId: string;
  partnerMessageId: string;
  /** True when this exchangeId had already been stored; nothing new was written. */
  duplicate: boolean;
}

/** Server -> client: the exchange was not stored. */
export interface VoiceExchangeRejectedServerMessage {
  type: 'voice:exchange:rejected';
  exchangeId: string | null;
  reason: 'invalid' | 'session_ended' | 'quota_exhausted' | 'storage_failed';
  /** storage_failed is worth retrying with the same exchangeId; the rest are not. */
  retryable: boolean;
}

/**
 * Returned by the tRPC `voice.startSession` mutation. The token is short-lived
 * and locked server-side to the model, voice and persona prompt below: the
 * client cannot change them.
 */
export interface VoiceSessionGrant {
  /** Ephemeral Gemini Live token. Pass as the apiKey to `new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } })`. */
  token: string;
  /** Model to pass to `ai.live.connect`. Must match the locked model. */
  model: string;
  /** No new Live session can be opened with this token after this time. */
  newSessionExpiresAt: string;
  /** Messages are rejected after this time; request a new grant to reconnect. */
  expiresAt: string;
  /** Opaque version string; echo it on every VoiceExchange. */
  voiceSessionVersion: string;
}
