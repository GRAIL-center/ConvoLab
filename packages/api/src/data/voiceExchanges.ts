import type { DocumentData, Firestore } from '@google-cloud/firestore';
import { getFirestoreClient } from '@workspace/database';
import type { VoiceExchange } from '../voice/contract.js';

const SESSION_COLLECTION = 'conversationSessions';
const MESSAGE_COLLECTION = 'messages';

export interface StoredVoiceExchange {
  userMessageId: string;
  partnerMessageId: string;
  /** True when this exchangeId was already stored; nothing was written. */
  duplicate: boolean;
  /** Server timestamps actually stored (the originals, on a duplicate). */
  userTimestamp: Date;
  partnerTimestamp: Date;
}

/**
 * Where the stored participant text came from: `server` is our own
 * transcription of the turn's audio; `live` is Gemini Live's input
 * transcription as the client reported it; `unverified` is client text that
 * names a server transcription this connection no longer holds (e.g. after a
 * reconnect).
 */
export type VoiceTranscriptSource = 'server' | 'live' | 'unverified';

export class SessionEndedError extends Error {
  constructor() {
    super('Cannot add a message to a completed session');
  }
}

/**
 * Message ids derive from the exchange id, so a resend after a reconnect
 * lands on the same documents instead of creating new ones.
 */
export function voiceMessageIds(sessionId: string, exchangeId: string) {
  return { user: `${sessionId}_v_${exchangeId}_u`, partner: `${sessionId}_v_${exchangeId}_p` };
}

function asDate(value: unknown, fallback: Date): Date {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return fallback;
}

/**
 * Stores a voice exchange's participant and partner messages and bumps the
 * session counter by two, all in one transaction, exactly once per exchangeId.
 *
 * The partner message content is what the participant heard
 * (`deliveredText`); the full generated text, interruption status and client
 * timings go in metadata. Timestamps are server time so voice and typed
 * messages in the same session sort consistently regardless of client clock.
 */
export async function storeVoiceExchange(
  sessionId: string,
  exchange: VoiceExchange & {
    transcriptSource?: VoiceTranscriptSource;
    /** Model that produced a `server` transcript. */
    transcriptModel?: string;
  },
  receivedAt: Date = new Date(),
  firestore: Firestore = getFirestoreClient()
): Promise<StoredVoiceExchange> {
  const ids = voiceMessageIds(sessionId, exchange.exchangeId);
  const sessionRef = firestore.collection(SESSION_COLLECTION).doc(String(sessionId));
  const userRef = firestore.collection(MESSAGE_COLLECTION).doc(ids.user);
  const partnerRef = firestore.collection(MESSAGE_COLLECTION).doc(ids.partner);
  const userTimestamp = receivedAt;
  // One millisecond later, so the pair always sorts user-then-partner.
  const partnerTimestamp = new Date(receivedAt.getTime() + 1);

  return firestore.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    const existingUser = await transaction.get(userRef);
    if (!sessionSnapshot.exists) throw new Error('Session not found');

    // Duplicate check comes before the completed check: a resend of an
    // exchange that was stored just before the session ended is still a
    // success, not an error.
    if (existingUser.exists) {
      const existingPartner = await transaction.get(partnerRef);
      return {
        userMessageId: ids.user,
        partnerMessageId: ids.partner,
        duplicate: true,
        userTimestamp: asDate(existingUser.data()?.timestamp, userTimestamp),
        partnerTimestamp: asDate(existingPartner.data()?.timestamp, partnerTimestamp),
      };
    }

    const session = sessionSnapshot.data() ?? {};
    if (session.endedAt || session.status === 'COMPLETED') throw new SessionEndedError();
    const totalMessages = typeof session.totalMessages === 'number' ? session.totalMessages : 0;

    const common = {
      sessionId,
      conversationSessionId: sessionId,
      messageType: 'main',
    };
    const voiceMeta = {
      modality: 'voice',
      exchangeId: exchange.exchangeId,
      // What the client says produced the turn, and what the server last
      // granted for this session. They differ only if something is wrong.
      voiceSessionVersion: exchange.voiceSessionVersion,
      ...(typeof session.voiceSessionVersion === 'string'
        ? { grantedVoiceSessionVersion: session.voiceSessionVersion }
        : {}),
    };

    transaction.create(userRef, {
      ...common,
      role: 'user',
      content: exchange.participant.transcript,
      timestamp: userTimestamp,
      metadata: {
        ...voiceMeta,
        spokenStartedAt: exchange.participant.startedAt,
        spokenEndedAt: exchange.participant.endedAt,
        transcriptSource: exchange.transcriptSource ?? 'live',
        ...(exchange.transcriptModel ? { transcriptModel: exchange.transcriptModel } : {}),
        ...(exchange.participant.liveTranscript !== undefined
          ? { liveTranscript: exchange.participant.liveTranscript }
          : {}),
      },
    } as DocumentData);
    transaction.create(partnerRef, {
      ...common,
      role: 'partner',
      content: exchange.partner.deliveredText,
      timestamp: partnerTimestamp,
      metadata: {
        ...voiceMeta,
        generatedText: exchange.partner.generatedText,
        interrupted: exchange.partner.interrupted,
        playbackCompleted: exchange.partner.playbackCompleted,
        ...(exchange.partner.playedMs !== undefined ? { playedMs: exchange.partner.playedMs } : {}),
        spokenStartedAt: exchange.partner.startedAt,
        spokenEndedAt: exchange.partner.endedAt,
      },
    } as DocumentData);
    transaction.update(sessionRef, { totalMessages: totalMessages + 2 });

    return {
      userMessageId: ids.user,
      partnerMessageId: ids.partner,
      duplicate: false,
      userTimestamp,
      partnerTimestamp,
    };
  });
}
