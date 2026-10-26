import type {
  VoiceExchange,
  VoiceSessionGrant,
  VoiceState,
  VoiceStatusEvent,
  VoiceTranscribeContext,
} from '@workspace/api/src/voice/contract';
import { INPUT_MIME } from './audio';
import { ExchangeAssembler, type PartnerTurnEnd } from './exchangeAssembler';
import { TurnAudio } from './turnAudio';

/** The parts of a Gemini Live server message voice mode reads. */
export interface LiveMessageLike {
  serverContent?: {
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    modelTurn?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
    interrupted?: boolean;
    turnComplete?: boolean;
  };
  goAway?: unknown;
}

export interface LiveSessionLike {
  sendRealtimeInput(input: {
    audio?: { data: string; mimeType: string };
    audioStreamEnd?: boolean;
  }): void;
  close(): void;
}

export type LiveConnector = (
  grant: VoiceSessionGrant,
  callbacks: {
    onmessage: (message: LiveMessageLike) => void;
    onclose: (event: { code?: number; reason?: string }) => void;
    onerror: (error: unknown) => void;
  }
) => Promise<LiveSessionLike>;

export interface PlayerLike {
  enqueue(base64Pcm: string): void;
  readonly isPlaying: boolean;
  readonly playedMs: number;
  readonly receivedMs: number;
  interrupt(): { playedMs: number; receivedMs: number };
  resetTurn(): void;
  onDrained: (() => void) | null;
  resume(): Promise<void>;
  close(): void;
}

export interface MicLike {
  setMuted(muted: boolean): void;
  stop(): void;
}

export type VoiceErrorKind = 'mic_denied' | 'mic_lost' | 'unavailable' | 'connection_lost';

export interface VoiceError {
  kind: VoiceErrorKind;
  message: string;
}

/**
 * The exchange in flight, for display only. It is never stored; the finished
 * exchange goes through onExchange.
 */
export interface LiveTurn {
  /** The participant's words, once known. */
  participant: string;
  /** The participant has spoken but their words are not ready to show yet. */
  participantPending: boolean;
  partnerSpeaking: boolean;
}

export const NO_LIVE_TURN: LiveTurn = {
  participant: '',
  participantPending: false,
  partnerSpeaking: false,
};

/** A server transcription of one participant turn. */
export interface TurnTranscript {
  transcriptId: string;
  text: string;
}

/** A transcription in progress; `result` is undefined until it settles, null if it failed. */
interface PendingTranscript {
  promise: Promise<TurnTranscript | null>;
  result: TurnTranscript | null | undefined;
}

/** How long a finished exchange waits for its transcription before using Live's text. */
const TRANSCRIPT_WAIT_MS = 8000;
/**
 * Silence after speech that starts transcription early, before Gemini has
 * decided the turn is over (its reply arrives a second or two later). If they
 * carry on talking, the early result is thrown away and the turn redone.
 */
const EARLY_TRANSCRIBE_SILENCE_MS = 600;
/** Less speech than this (a cough, a click) never starts a transcription early. */
const MIN_SPEECH_MS = 300;
/**
 * Mic audio kept from before an interruption. The participant started talking
 * before either cue fired: Gemini flags `interrupted` once its turn detection
 * has heard enough, and Live's transcript of the barge-in lags the speech by a
 * second or more. Silence and echo-cancelled partner audio in it are trimmed.
 */
const BARGE_IN_LOOKBACK_MS = 4000;

export interface VoiceControllerDeps {
  getGrant: () => Promise<VoiceSessionGrant>;
  connect: LiveConnector;
  createPlayer: () => PlayerLike;
  startMic: (handlers: {
    onFrame: (base64Pcm: string) => void;
    onLevel?: (level: number) => void;
    onEnded?: () => void;
  }) => Promise<MicLike>;
  onExchange: (exchange: VoiceExchange) => void;
  /**
   * Transcribe one participant turn (base64 PCM16, 16 kHz). Resolves null on
   * failure. Without it, Gemini Live's input transcription is used as is.
   */
  transcribe?: (audio: string, context: VoiceTranscribeContext) => Promise<TurnTranscript | null>;
  onStatus: (event: VoiceStatusEvent) => void;
  onState: (state: VoiceState) => void;
  onLevel?: (level: number) => void;
  /** The exchange in flight changed. Called after onExchange for a finished one. */
  onLiveTurn?: (turn: LiveTurn) => void;
  /** Voice has stopped and cannot continue; the UI should offer text. */
  onFatal: (error: VoiceError) => void;
  now?: () => Date;
  /** Delay before reconnect attempt n (1-based). */
  reconnectDelayMs?: (attempt: number) => number;
}

const MAX_RECONNECT_ATTEMPTS = 3;

const MESSAGES: Record<VoiceErrorKind, string> = {
  mic_denied: 'Microphone access is blocked. Allow it in your browser, or type instead.',
  mic_lost: 'Your microphone disconnected.',
  unavailable: "Voice isn't available right now.",
  connection_lost: 'The voice connection dropped.',
};

/**
 * One voice session: mic in, partner audio out, finished exchanges reported.
 *
 * Exchanges are emitted only once the partner's turn is over (played out or
 * interrupted), so nothing partial ever reaches ConvoLab. A dropped Live
 * connection discards the exchange in flight and reconnects with a fresh
 * grant, which rebuilds the conversation from the stored record.
 */
export class VoiceController {
  private readonly now: () => Date;
  private player: PlayerLike | null = null;
  private mic: MicLike | null = null;
  private session: LiveSessionLike | null = null;
  private assembler: ExchangeAssembler | null = null;
  private muted = false;
  private stopped = false;
  private generationDone = false;
  /** After a server interruption, audio still in flight belongs to the cancelled reply. */
  private discardPartnerAudio = false;
  private reconnectWhenIdle = false;
  private reconnectAttempts = 0;
  /** Bumped per Live connection so callbacks from an old one are ignored. */
  private connectionSeq = 0;
  /** Mic audio of the participant's current turn, for transcription. */
  private readonly turnAudio = new TurnAudio();
  /** Transcription of the turn the partner is answering now. */
  private turnTranscript: PendingTranscript | null = null;
  /** The last finished exchange, as context for transcribing the next turn. */
  private previousExchange: {
    transcript: PendingTranscript | null;
    liveText: string;
    partner: string;
  } | null = null;
  /** Transcription started at a pause, and the speech it covers. */
  private early: { transcript: PendingTranscript; speechSeq: number } | null = null;
  /** Finished exchanges waiting on their transcription, oldest first. */
  private readonly unsent: Array<{ transcript: PendingTranscript; liveText: string }> = [];
  private sendChain: Promise<void> = Promise.resolve();

  constructor(private readonly deps: VoiceControllerDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** Call from a click handler: audio playback needs the user gesture. */
  async start(): Promise<void> {
    this.deps.onState('connecting');
    this.player = this.deps.createPlayer();
    this.player.onDrained = () => this.onPlaybackDrained();
    const resumed = this.player.resume();

    try {
      this.mic = await this.deps.startMic({
        onFrame: (data) => {
          if (this.muted || !this.session) return;
          this.session.sendRealtimeInput({ audio: { data, mimeType: INPUT_MIME } });
          if (!this.deps.transcribe) return;
          this.turnAudio.push(data);
          this.maybeTranscribeEarly();
        },
        onLevel: this.deps.onLevel,
        onEnded: () => this.fail('mic_lost'),
      });
    } catch (error) {
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      this.fail(denied ? 'mic_denied' : 'mic_lost', (error as Error)?.name);
      return;
    }
    await resumed.catch(() => undefined);
    if (this.stopped) return;

    if (await this.openLive()) this.deps.onStatus({ kind: 'started' });
  }

  setMuted(muted: boolean): void {
    if (this.stopped || this.muted === muted) return;
    this.muted = muted;
    this.mic?.setMuted(muted);
    // Lets the server's turn detection close the participant's turn now.
    if (muted) this.session?.sendRealtimeInput({ audioStreamEnd: true });
    this.deps.onState(muted ? 'muted' : 'listening');
  }

  /** End voice. A partner reply in progress counts as interrupted where it stopped. */
  stop(): void {
    if (this.stopped) return;
    if (this.assembler?.partnerActive && this.player) {
      this.finishPartnerTurn(true, this.player.interrupt());
    }
    this.teardown();
    this.deps.onStatus({ kind: 'ended' });
    this.deps.onState('disconnected');
  }

  private async openLive(): Promise<boolean> {
    const seq = ++this.connectionSeq;
    let grant: VoiceSessionGrant;
    try {
      grant = await this.deps.getGrant();
    } catch {
      this.fail('unavailable', 'grant_failed');
      return false;
    }
    if (this.stopped) return false;

    this.assembler = new ExchangeAssembler(grant.voiceSessionVersion);
    this.generationDone = false;
    this.discardPartnerAudio = false;
    try {
      const session = await this.deps.connect(grant, {
        onmessage: (message) => {
          if (seq === this.connectionSeq) this.onLiveMessage(message);
        },
        onclose: (event) => {
          if (seq === this.connectionSeq) void this.onLiveClosed(event);
        },
        onerror: () => {
          // onclose follows and carries the recovery.
        },
      });
      if (this.stopped || seq !== this.connectionSeq) {
        session.close();
        return false;
      }
      this.session = session;
    } catch {
      return this.retryOrFail('connect_failed');
    }
    this.deps.onState(this.muted ? 'muted' : 'listening');
    return true;
  }

  private onLiveMessage(message: LiveMessageLike): void {
    const assembler = this.assembler;
    const player = this.player;
    if (!assembler || !player || this.stopped) return;
    const now = this.now();
    // Only a connection that actually delivers something counts as recovered;
    // one that opens and drops at once must still run out of retries.
    this.reconnectAttempts = 0;

    if (message.goAway !== undefined) {
      // The server will close this connection soon. Move to a fresh one at
      // the next quiet moment so no exchange is cut in half.
      this.reconnectWhenIdle = true;
      if (!assembler.partnerActive) void this.reconnect();
    }

    const content = message.serverContent;
    if (!content) return;

    if (content.interrupted) {
      if (assembler.partnerActive) this.finishPartnerTurn(true, player.interrupt());
      this.discardPartnerAudio = true;
    }

    const heard = content.inputTranscription?.text;
    if (heard) {
      this.discardPartnerAudio = false;
      // The reply has finished generating but is still playing out of the
      // buffer, so the server will not flag this barge-in; cut it here.
      if (assembler.partnerActive && this.generationDone && player.isPlaying) {
        this.finishPartnerTurn(true, player.interrupt());
      }
      assembler.participantSpeech(heard, now);
      this.emitLiveTurn();
      if (!assembler.partnerActive && !this.muted) this.deps.onState('participant_speaking');
    }

    if (!this.discardPartnerAudio) {
      for (const part of content.modelTurn?.parts ?? []) {
        const data = part.inlineData?.data;
        if (!data || !part.inlineData?.mimeType?.startsWith('audio/')) continue;
        this.beginPartnerTurnIfNeeded(now);
        player.enqueue(data);
      }
      const said = content.outputTranscription?.text;
      if (said) {
        this.beginPartnerTurnIfNeeded(now);
        assembler.partnerOutput(said, now);
      }
    }

    if (content.turnComplete) {
      this.discardPartnerAudio = false;
      this.generationDone = true;
      if (assembler.partnerActive && !player.isPlaying) {
        this.finishPartnerTurn(false, { playedMs: player.playedMs, receivedMs: player.receivedMs });
      }
    }
  }

  private beginPartnerTurnIfNeeded(now: Date): void {
    if (!this.assembler || this.assembler.partnerActive) return;
    this.player?.resetTurn();
    this.generationDone = false;
    this.assembler.partnerOutput('', now);
    // The participant's turn ends where the partner's begins.
    this.turnTranscript = this.transcribeTurn();
    this.deps.onState('partner_speaking');
    this.emitLiveTurn();
  }

  private onPlaybackDrained(): void {
    const player = this.player;
    if (!player || !this.assembler?.partnerActive || !this.generationDone) return;
    this.finishPartnerTurn(false, { playedMs: player.playedMs, receivedMs: player.receivedMs });
  }

  private finishPartnerTurn(
    interrupted: boolean,
    played: { playedMs: number; receivedMs: number }
  ) {
    if (!this.assembler) return;
    const end: PartnerTurnEnd = { interrupted, ...played };
    const { exchange, droppedPartnerTurn } = this.assembler.finishPartnerTurn(end, this.now());
    const transcript = this.turnTranscript;
    this.turnTranscript = null;
    // Audio during the partner's turn is not the participant's, except when
    // they talked over it: then the start of their next turn is in there. On
    // an interruption their words have usually not been transcribed yet, so
    // keep the recent audio rather than going by the transcript.
    if (interrupted) this.turnAudio.keepLast(BARGE_IN_LOOKBACK_MS);
    else if (!this.assembler.participantTranscript) this.turnAudio.clear();
    this.generationDone = false;
    this.player?.resetTurn();
    if (exchange) {
      this.previousExchange = {
        transcript,
        liveText: exchange.participant.transcript,
        // What they heard; if they cut it off before any played, what it was about to say.
        partner: exchange.partner.deliveredText || exchange.partner.generatedText,
      };
      this.sendExchange(exchange, transcript);
    }
    // Held barge-in speech is now the participant's turn in flight.
    this.emitLiveTurn();
    if (droppedPartnerTurn) {
      // The partner answered something the transcript never caught (often
      // noise). Not storable as an exchange; reported so it can be counted.
      this.deps.onStatus({ kind: 'provider_error', detail: 'partner_turn_without_transcript' });
    }
    if (!this.stopped) this.deps.onState(this.muted ? 'muted' : 'listening');
    if (this.reconnectWhenIdle && !this.stopped) void this.reconnect();
  }

  private async onLiveClosed(event: { code?: number; reason?: string }): Promise<void> {
    if (this.stopped) return;
    this.session = null;
    // Whatever was in flight is lost; never store half an exchange.
    this.player?.interrupt();
    this.assembler?.reset();
    this.forgetTurn();
    this.emitLiveTurn();
    await this.retryOrFail(`closed_${event.code ?? 'unknown'}`);
  }

  private async retryOrFail(detail: string): Promise<boolean> {
    if (this.stopped) return false;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.fail('connection_lost', detail);
      return false;
    }
    this.reconnectAttempts++;
    this.deps.onState('reconnecting');
    this.deps.onStatus({ kind: 'reconnecting', detail });
    const delay =
      this.deps.reconnectDelayMs?.(this.reconnectAttempts) ??
      1000 * 2 ** (this.reconnectAttempts - 1);
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (this.stopped) return false;
    const ok = await this.openLive();
    if (ok) this.deps.onStatus({ kind: 'reconnected' });
    return ok;
  }

  private async reconnect(): Promise<void> {
    this.reconnectWhenIdle = false;
    const old = this.session;
    this.session = null;
    this.connectionSeq++; // ignore the old connection's close
    old?.close();
    this.assembler?.reset();
    this.forgetTurn();
    this.emitLiveTurn();
    this.deps.onState('reconnecting');
    if (await this.openLive()) this.deps.onStatus({ kind: 'reconnected', detail: 'go_away' });
  }

  private fail(kind: VoiceErrorKind, detail?: string): void {
    if (this.stopped) return;
    this.teardown();
    this.deps.onStatus({
      kind:
        kind === 'mic_denied' ? 'mic_denied' : kind === 'mic_lost' ? 'mic_lost' : 'provider_error',
      ...(detail ? { detail } : {}),
    });
    this.deps.onStatus({ kind: 'fell_back_to_text' });
    this.deps.onState('disconnected');
    this.deps.onFatal({ kind, message: MESSAGES[kind] });
  }

  private teardown(): void {
    this.stopped = true;
    this.connectionSeq++;
    this.mic?.stop();
    this.mic = null;
    this.session?.close();
    this.session = null;
    this.player?.close();
    this.player = null;
    this.assembler = null;
    this.forgetTurn();
    // Finished exchanges still waiting on a transcription are sent regardless.
    this.emitLiveTurn();
  }

  private forgetTurn(): void {
    this.turnAudio.clear();
    this.turnTranscript = null;
    this.early = null;
  }

  /** The participant has paused: start transcribing now rather than when the partner answers. */
  private maybeTranscribeEarly(): void {
    if (this.assembler?.partnerActive !== false) return;
    const audio = this.turnAudio;
    if (audio.speechMs < MIN_SPEECH_MS) return;
    if (audio.silenceAfterSpeechMs < EARLY_TRANSCRIBE_SILENCE_MS) return;
    // Already transcribing exactly this speech.
    if (this.early?.speechSeq === audio.lastSpeechSeq) return;
    const transcript = this.startTranscription(audio.clip());
    if (!transcript) return;
    this.early = { transcript, speechSeq: audio.lastSpeechSeq };
    this.emitLiveTurn();
  }

  /** The partner has started answering: the participant's turn is final. */
  private transcribeTurn(): PendingTranscript | null {
    const early = this.early;
    this.early = null;
    // Reuse the early transcription unless they spoke again after it started.
    const transcript =
      early && early.speechSeq === this.turnAudio.lastSpeechSeq
        ? early.transcript
        : this.startTranscription(this.turnAudio.clip());
    this.turnAudio.clear();
    return transcript;
  }

  /** Send a clip off for transcription. */
  private startTranscription(audio: string | null): PendingTranscript | null {
    if (!audio || !this.deps.transcribe) return null;
    const pending: PendingTranscript = {
      result: undefined,
      promise: this.deps
        .transcribe(audio, this.transcribeContext())
        .catch(() => null)
        .then((result) => {
          pending.result = result;
          this.emitLiveTurn();
          return result;
        }),
    };
    return pending;
  }

  private transcribeContext(): VoiceTranscribeContext {
    const hint = this.assembler?.participantTranscript;
    const previous = this.previousExchange;
    return {
      ...(hint ? { hint } : {}),
      ...(previous
        ? {
            previous: {
              participant: previous.transcript?.result?.text ?? previous.liveText,
              partner: previous.partner,
            },
          }
        : {}),
    };
  }

  /**
   * Report a finished exchange, with the server transcription in place of
   * Live's when it arrives in time. Exchanges go out in order, so one waiting
   * on its transcription holds back any that finish after it.
   */
  private sendExchange(exchange: VoiceExchange, transcript: PendingTranscript | null): void {
    if (!transcript && this.unsent.length === 0) {
      this.deps.onExchange(exchange);
      return;
    }
    if (transcript) this.unsent.push({ transcript, liveText: exchange.participant.transcript });
    this.sendChain = this.sendChain.then(async () => {
      let result: TurnTranscript | null = null;
      if (transcript) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        result = await Promise.race([
          transcript.promise,
          new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), TRANSCRIPT_WAIT_MS);
          }),
        ]);
        clearTimeout(timer);
        this.unsent.shift();
      }
      this.deps.onExchange(
        result
          ? {
              ...exchange,
              participant: {
                ...exchange.participant,
                transcript: result.text,
                transcriptId: result.transcriptId,
                liveTranscript: exchange.participant.transcript,
              },
            }
          : exchange
      );
      this.emitLiveTurn();
    });
  }

  private emitLiveTurn(): void {
    this.deps.onLiveTurn?.(this.liveTurn());
  }

  private liveTurn(): LiveTurn {
    // A finished exchange waiting on its transcription stays on screen with
    // the partner still speaking, so the bubbles do not blink out and back.
    const waiting = this.unsent[0];
    if (waiting) {
      return { ...this.shownWords(waiting.transcript, waiting.liveText), partnerSpeaking: true };
    }
    const assembler = this.assembler;
    if (!assembler) return NO_LIVE_TURN;
    const live = assembler.participantTranscript;
    if (assembler.partnerActive) {
      return { ...this.shownWords(this.turnTranscript, live), partnerSpeaking: true };
    }
    if (!this.deps.transcribe) {
      return { participant: live, participantPending: false, partnerSpeaking: false };
    }
    // Their words show as soon as a transcription of everything they have
    // said is back, which can be before the partner starts to answer.
    const early = this.early;
    const current = early?.speechSeq === this.turnAudio.lastSpeechSeq ? early : null;
    if (current?.transcript.result) {
      return {
        participant: current.transcript.result.text,
        participantPending: false,
        partnerSpeaking: false,
      };
    }
    return { participant: '', participantPending: !!live || !!early, partnerSpeaking: false };
  }

  private shownWords(
    transcript: PendingTranscript | null,
    liveText: string
  ): Pick<LiveTurn, 'participant' | 'participantPending'> {
    if (transcript && transcript.result === undefined) {
      return { participant: '', participantPending: true };
    }
    return { participant: transcript?.result?.text ?? liveText, participantPending: false };
  }
}
