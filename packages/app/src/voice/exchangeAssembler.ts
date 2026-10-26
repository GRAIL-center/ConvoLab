import type { VoiceExchange } from '@workspace/api/src/voice/contract';
import { estimateDeliveredText } from './deliveredText';

export interface PartnerTurnEnd {
  interrupted: boolean;
  /** Partner audio that played before the turn ended. */
  playedMs: number;
  /** Partner audio received for the turn. */
  receivedMs: number;
}

function joinTranscript(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Turns the stream of Live events into finished exchanges.
 *
 * Participant speech that arrives while the partner is mid-turn belongs to the
 * next exchange (it is usually the barge-in that interrupted the partner), so
 * it is held until the partner's turn ends. An exchange is emitted only when
 * the partner's turn has ended, either played out or interrupted, and the
 * participant said something. Nothing partial is ever emitted.
 */
export class ExchangeAssembler {
  private participantText = '';
  private participantStartedAt: Date | null = null;
  private participantEndedAt: Date | null = null;
  private nextParticipantText = '';
  private nextParticipantStartedAt: Date | null = null;
  private partnerText = '';
  private partnerStartedAt: Date | null = null;

  constructor(
    private readonly voiceSessionVersion: string,
    private readonly newExchangeId: () => string = () => crypto.randomUUID()
  ) {}

  get partnerActive(): boolean {
    return this.partnerStartedAt !== null;
  }

  /** What the participant has said so far in the exchange in flight. */
  get participantTranscript(): string {
    return joinTranscript(this.participantText);
  }

  participantSpeech(text: string, now: Date): void {
    if (!text) return;
    if (this.partnerActive) {
      this.nextParticipantStartedAt ??= now;
      this.nextParticipantText += text;
      return;
    }
    this.participantStartedAt ??= now;
    this.participantEndedAt = now;
    this.participantText += text;
  }

  /** A transcript chunk of the partner's speech, or '' when only audio arrived. */
  partnerOutput(text: string, now: Date): void {
    if (!this.partnerStartedAt) {
      this.partnerStartedAt = now;
      // The participant's turn ends where the partner's begins.
      this.participantEndedAt = now;
    }
    this.partnerText += text;
  }

  /**
   * The partner's turn is over. Returns the exchange, or null when the
   * participant had said nothing (e.g. noise triggered a reply), in which
   * case `droppedPartnerTurn` reports it.
   */
  finishPartnerTurn(
    end: PartnerTurnEnd,
    now: Date
  ): { exchange: VoiceExchange | null; droppedPartnerTurn: boolean } {
    if (!this.partnerStartedAt) return { exchange: null, droppedPartnerTurn: false };

    const transcript = joinTranscript(this.participantText);
    const generatedText = joinTranscript(this.partnerText);
    const exchange: VoiceExchange | null = transcript
      ? {
          exchangeId: this.newExchangeId(),
          participant: {
            transcript,
            startedAt: (this.participantStartedAt ?? this.partnerStartedAt).toISOString(),
            endedAt: (this.participantEndedAt ?? this.partnerStartedAt).toISOString(),
          },
          partner: {
            deliveredText: end.interrupted
              ? estimateDeliveredText(generatedText, end.playedMs, end.receivedMs)
              : generatedText,
            generatedText,
            interrupted: end.interrupted,
            playbackCompleted: !end.interrupted,
            playedMs: Math.max(0, Math.round(end.playedMs)),
            startedAt: this.partnerStartedAt.toISOString(),
            endedAt: now.toISOString(),
          },
          voiceSessionVersion: this.voiceSessionVersion,
        }
      : null;

    // Held barge-in speech becomes the next participant turn.
    this.participantText = this.nextParticipantText;
    this.participantStartedAt = this.nextParticipantStartedAt;
    this.participantEndedAt = this.nextParticipantStartedAt;
    this.nextParticipantText = '';
    this.nextParticipantStartedAt = null;
    this.partnerText = '';
    this.partnerStartedAt = null;

    return { exchange, droppedPartnerTurn: !exchange };
  }

  /** Forget everything in flight, e.g. when the Live connection drops mid-exchange. */
  reset(): void {
    this.participantText = '';
    this.participantStartedAt = null;
    this.participantEndedAt = null;
    this.nextParticipantText = '';
    this.nextParticipantStartedAt = null;
    this.partnerText = '';
    this.partnerStartedAt = null;
  }
}
