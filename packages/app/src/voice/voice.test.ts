import type { VoiceExchange, VoiceStatusEvent } from '@workspace/api/src/voice/contract';
import { describe, expect, it, vi } from 'vitest';
import { estimateDeliveredText } from './deliveredText';
import { ExchangeAssembler } from './exchangeAssembler';
import { TurnAudio } from './turnAudio';
import {
  type LiveMessageLike,
  type LiveSessionLike,
  type LiveTurn,
  NO_LIVE_TURN,
  type PlayerLike,
  VoiceController,
  type VoiceControllerDeps,
  type VoiceError,
} from './voiceController';

const T0 = new Date('2026-10-17T14:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

describe('estimateDeliveredText', () => {
  const reply = 'I understand your concern, but this proposal could reduce costs.';

  it('is the whole reply when it all played', () => {
    expect(estimateDeliveredText(reply, 4000, 4000)).toBe(reply);
  });

  it('is nothing when no audio played', () => {
    expect(estimateDeliveredText(reply, 0, 4000)).toBe('');
  });

  it('is nothing when the transcript arrived but no audio had yet', () => {
    expect(estimateDeliveredText('Hey.', 0, 0)).toBe('');
  });

  it('keeps only whole words heard before the cut', () => {
    const heard = estimateDeliveredText(reply, 2000, 4000);
    expect(reply.startsWith(heard)).toBe(true);
    expect(heard.length).toBeLessThanOrEqual(reply.length / 2);
    expect(heard).toBe('I understand your concern, but');
  });
});

describe('ExchangeAssembler', () => {
  it('emits one exchange per finished partner turn', () => {
    const a = new ExchangeAssembler('v1', () => 'ex-00000001');
    a.participantSpeech(' Hello', at(0));
    a.participantSpeech(' there.', at(500));
    a.partnerOutput('Hi! ', at(1000));
    a.partnerOutput('Nice to meet you.', at(1200));
    const { exchange } = a.finishPartnerTurn(
      { interrupted: false, playedMs: 2000, receivedMs: 2000 },
      at(3000)
    );

    expect(exchange).toMatchObject({
      exchangeId: 'ex-00000001',
      participant: {
        transcript: 'Hello there.',
        startedAt: at(0).toISOString(),
        endedAt: at(1000).toISOString(),
      },
      partner: {
        deliveredText: 'Hi! Nice to meet you.',
        interrupted: false,
        playbackCompleted: true,
        startedAt: at(1000).toISOString(),
        endedAt: at(3000).toISOString(),
      },
      voiceSessionVersion: 'v1',
    });
  });

  it('records only the heard part of an interrupted reply', () => {
    const a = new ExchangeAssembler('v1', () => 'ex-00000001');
    a.participantSpeech('Why?', at(0));
    a.partnerOutput('Because prices went up and wages did not.', at(1000));
    const { exchange } = a.finishPartnerTurn(
      { interrupted: true, playedMs: 1000, receivedMs: 4000 },
      at(2000)
    );
    expect(exchange?.partner.deliveredText).toBe('Because');
    expect(exchange?.partner.generatedText).toBe('Because prices went up and wages did not.');
    expect(exchange?.partner.playbackCompleted).toBe(false);
  });

  it('holds barge-in speech for the next exchange', () => {
    let n = 0;
    const a = new ExchangeAssembler('v1', () => `ex-0000000${++n}`);
    a.participantSpeech('First.', at(0));
    a.partnerOutput('Well, I', at(1000));
    a.participantSpeech('Wait, hold on.', at(1500));
    const first = a.finishPartnerTurn(
      { interrupted: true, playedMs: 500, receivedMs: 500 },
      at(1600)
    );
    expect(first.exchange?.participant.transcript).toBe('First.');

    a.partnerOutput('Sure.', at(2500));
    const second = a.finishPartnerTurn(
      { interrupted: false, playedMs: 800, receivedMs: 800 },
      at(3500)
    );
    expect(second.exchange?.participant.transcript).toBe('Wait, hold on.');
  });

  it('emits nothing when the partner answered silence', () => {
    const a = new ExchangeAssembler('v1');
    a.partnerOutput('Are you there?', at(0));
    const result = a.finishPartnerTurn(
      { interrupted: false, playedMs: 1, receivedMs: 1 },
      at(1000)
    );
    expect(result).toEqual({ exchange: null, droppedPartnerTurn: true });
  });
});

class FakePlayer implements PlayerLike {
  queued = 0;
  playedMs = 0;
  receivedMs = 0;
  onDrained: (() => void) | null = null;
  closed = false;
  get isPlaying() {
    return this.queued > 0;
  }
  enqueue() {
    this.queued++;
    this.receivedMs += 1000;
  }
  /** Simulate the queue playing out. */
  drain() {
    this.playedMs = this.receivedMs;
    this.queued = 0;
    this.onDrained?.();
  }
  interrupt() {
    const r = { playedMs: this.playedMs, receivedMs: this.receivedMs };
    this.queued = 0;
    return r;
  }
  resetTurn() {
    this.playedMs = 0;
    this.receivedMs = 0;
  }
  async resume() {}
  close() {
    this.closed = true;
  }
}

function harness(opts: { micError?: Error; transcribe?: VoiceControllerDeps['transcribe'] } = {}) {
  const exchanges: VoiceExchange[] = [];
  const liveTurns: LiveTurn[] = [];
  const statuses: VoiceStatusEvent[] = [];
  const fatal: VoiceError[] = [];
  const player = new FakePlayer();
  const sessions: Array<{
    session: LiveSessionLike & { sent: unknown[]; closed: boolean };
    emit: (m: LiveMessageLike) => void;
    close: (code?: number) => void;
  }> = [];
  let micFrame: ((d: string) => void) | null = null;
  const mic = { setMuted: vi.fn(), stop: vi.fn() };
  let n = 0;

  const controller = new VoiceController({
    getGrant: vi.fn(async () => ({
      token: 't',
      model: 'm',
      newSessionExpiresAt: '',
      expiresAt: '',
      voiceSessionVersion: `v${++n}`,
    })),
    connect: async (_grant, callbacks) => {
      const session = {
        sent: [] as unknown[],
        closed: false,
        sendRealtimeInput(input: unknown) {
          this.sent.push(input);
        },
        close() {
          this.closed = true;
        },
      };
      sessions.push({
        session,
        emit: callbacks.onmessage,
        close: (code = 1011) => callbacks.onclose({ code }),
      });
      return session;
    },
    createPlayer: () => player,
    startMic: async (handlers) => {
      if (opts.micError) throw opts.micError;
      micFrame = handlers.onFrame;
      return mic;
    },
    onExchange: (e) => exchanges.push(e),
    transcribe: opts.transcribe,
    onLiveTurn: (t) => liveTurns.push(t),
    onStatus: (s) => statuses.push(s),
    onState: () => {},
    onFatal: (e) => fatal.push(e),
    reconnectDelayMs: () => 0,
    now: () => T0,
  });
  return {
    controller,
    exchanges,
    liveTurns,
    statuses,
    fatal,
    player,
    sessions,
    mic,
    sendMic: (d: string) => micFrame?.(d),
  };
}

/** `ms` of 16 kHz PCM16 mic audio: a steady tone for speech, zeros for silence. */
function micAudio(ms: number, speech: boolean): string {
  const samples = new Int16Array((16_000 * ms) / 1000).fill(speech ? 8000 : 0);
  return Buffer.from(samples.buffer).toString('base64');
}

/** Feed `ms` of mic audio in 100 ms frames, as the worklet does. */
function talk(h: ReturnType<typeof harness>, ms: number, speech = true) {
  for (let t = 0; t < ms; t += 100) h.sendMic(micAudio(100, speech));
}

const audio = (data = 'AAAA') => ({
  serverContent: {
    modelTurn: { parts: [{ inlineData: { data, mimeType: 'audio/pcm;rate=24000' } }] },
  },
});

describe('TurnAudio', () => {
  it('trims the silence around the speech, keeping a little padding', () => {
    const turn = new TurnAudio();
    for (let i = 0; i < 30; i++) turn.push(micAudio(100, false));
    for (let i = 0; i < 5; i++) turn.push(micAudio(100, true));
    for (let i = 0; i < 20; i++) turn.push(micAudio(100, false));

    expect(turn.speechMs).toBe(500);
    expect(turn.silenceAfterSpeechMs).toBe(2000);
    const clip = turn.clip();
    // 400 ms pad + 500 ms speech + 400 ms pad, at 32 bytes per ms.
    expect(Buffer.from(clip ?? '', 'base64').length).toBe(1300 * 32);
  });

  it('has no clip when nothing was said', () => {
    const turn = new TurnAudio();
    for (let i = 0; i < 10; i++) turn.push(micAudio(100, false));
    expect(turn.clip()).toBeNull();
  });
});

describe('VoiceController', () => {
  it('shows the participant turn as soon as it is heard, then the partner speaking', async () => {
    const h = harness();
    await h.controller.start();
    const live = h.sessions[0];

    live.emit({ serverContent: { inputTranscription: { text: 'Hello' } } });
    live.emit({ serverContent: { inputTranscription: { text: ' there.' } } });
    expect(h.liveTurns.at(-1)).toEqual({
      participant: 'Hello there.',
      participantPending: false,
      partnerSpeaking: false,
    });

    live.emit(audio());
    expect(h.liveTurns.at(-1)).toMatchObject({
      participant: 'Hello there.',
      partnerSpeaking: true,
    });

    live.emit({ serverContent: { turnComplete: true } });
    h.player.drain();
    expect(h.exchanges).toHaveLength(1);
    expect(h.liveTurns.at(-1)).toEqual(NO_LIVE_TURN);
  });

  it('replaces the Live transcript with the server transcription of the turn audio', async () => {
    let finish: (r: { transcriptId: string; text: string } | null) => void = () => {};
    const transcribe = vi.fn(
      () =>
        new Promise<{ transcriptId: string; text: string } | null>((resolve) => {
          finish = resolve;
        })
    );
    const h = harness({ transcribe });
    await h.controller.start();
    const live = h.sessions[0];

    talk(h, 500);
    live.emit({ serverContent: { inputTranscription: { text: 'Why do you thing that' } } });
    // Words are held back while the participant talks: Live's guess is not shown.
    expect(h.liveTurns.at(-1)).toMatchObject({ participant: '', participantPending: true });

    talk(h, 300);
    live.emit(audio());
    expect(transcribe).toHaveBeenCalledTimes(1);
    live.emit({ serverContent: { turnComplete: true } });
    h.player.drain();
    // Reply over, transcription not back yet: the exchange waits for it.
    expect(h.exchanges).toHaveLength(0);
    expect(h.liveTurns.at(-1)).toMatchObject({ participantPending: true, partnerSpeaking: true });

    finish({ transcriptId: 'tr-00000001', text: 'Why do you think that?' });
    await vi.waitFor(() => expect(h.exchanges).toHaveLength(1));
    expect(h.exchanges[0].participant).toMatchObject({
      transcript: 'Why do you think that?',
      transcriptId: 'tr-00000001',
      liveTranscript: 'Why do you thing that',
    });
    expect(h.liveTurns.at(-1)).toEqual(NO_LIVE_TURN);
  });

  it('starts transcribing at a pause, before the partner answers, and shows the words', async () => {
    const transcribe = vi
      .fn()
      .mockResolvedValue({ transcriptId: 'tr-00000001', text: 'Hi Ashley.' });
    const h = harness({ transcribe });
    await h.controller.start();
    const live = h.sessions[0];

    talk(h, 500);
    live.emit({ serverContent: { inputTranscription: { text: 'Hi Ashly' } } });
    talk(h, 500, false);
    expect(transcribe).not.toHaveBeenCalled(); // not quiet for long enough yet
    talk(h, 200, false);
    expect(transcribe).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(h.liveTurns.at(-1)).toEqual({
        participant: 'Hi Ashley.',
        participantPending: false,
        partnerSpeaking: false,
      })
    );

    // The partner's answer reuses it rather than transcribing again.
    live.emit(audio());
    live.emit({ serverContent: { turnComplete: true } });
    h.player.drain();
    await vi.waitFor(() => expect(h.exchanges).toHaveLength(1));
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(h.exchanges[0].participant.transcript).toBe('Hi Ashley.');
  });

  it('redoes the transcription when they carry on after a pause', async () => {
    const transcribe = vi
      .fn()
      .mockResolvedValueOnce({ transcriptId: 'tr-00000001', text: 'Hi Ashley.' })
      .mockResolvedValueOnce({
        transcriptId: 'tr-00000002',
        text: 'Hi Ashley. I keep hearing about tariffs.',
      });
    const h = harness({ transcribe });
    await h.controller.start();
    const live = h.sessions[0];

    talk(h, 500);
    live.emit({ serverContent: { inputTranscription: { text: 'Hi Ashly.' } } });
    talk(h, 700, false);
    talk(h, 800);
    live.emit({
      serverContent: { inputTranscription: { text: ' I keep hearing about tariffs.' } },
    });
    // Speaking again hides the early words until the whole turn is transcribed.
    expect(h.liveTurns.at(-1)).toMatchObject({ participant: '', participantPending: true });

    live.emit(audio());
    expect(transcribe).toHaveBeenCalledTimes(2);
    live.emit({ serverContent: { turnComplete: true } });
    h.player.drain();
    await vi.waitFor(() => expect(h.exchanges).toHaveLength(1));
    expect(h.exchanges[0].participant).toMatchObject({
      transcript: 'Hi Ashley. I keep hearing about tariffs.',
      transcriptId: 'tr-00000002',
    });
  });

  it('keeps the start of an interruption for transcription', async () => {
    const transcribe = vi
      .fn()
      .mockResolvedValueOnce({ transcriptId: 'tr-00000001', text: 'Why?' })
      .mockResolvedValueOnce({ transcriptId: 'tr-00000002', text: 'Wait, hold on.' });
    const h = harness({ transcribe });
    await h.controller.start();
    const live = h.sessions[0];

    talk(h, 500);
    live.emit({ serverContent: { inputTranscription: { text: 'Why?' } } });
    live.emit(audio());
    // The partner talks for a while, then the participant cuts in. Gemini
    // flags the interruption before it has transcribed a word of it.
    talk(h, 3000, false);
    talk(h, 1200);
    live.emit({ serverContent: { interrupted: true } });
    talk(h, 600);
    live.emit({ serverContent: { inputTranscription: { text: 'Wait, hold up.' } } });
    talk(h, 700, false);

    expect(transcribe).toHaveBeenCalledTimes(2);
    // The interruption is read in the light of the exchange it cut into.
    expect(transcribe.mock.calls[1][1]).toEqual({
      hint: 'Wait, hold up.',
      previous: { participant: 'Why?', partner: '' },
    });
    const clip = Buffer.from(transcribe.mock.calls[1][0] as string, 'base64');
    // All 1.8 s of the barge-in, plus padding, with the partner's turn trimmed off.
    expect(clip.length).toBe((400 + 1200 + 600 + 400) * 32);
  });

  it('keeps the Live transcript when server transcription fails', async () => {
    const h = harness({ transcribe: vi.fn().mockResolvedValue(null) });
    await h.controller.start();
    const live = h.sessions[0];

    talk(h, 500);
    live.emit({ serverContent: { inputTranscription: { text: 'Hello.' } } });
    live.emit(audio());
    live.emit({ serverContent: { turnComplete: true } });
    h.player.drain();

    await vi.waitFor(() => expect(h.exchanges).toHaveLength(1));
    expect(h.exchanges[0].participant.transcript).toBe('Hello.');
    expect(h.exchanges[0].participant.transcriptId).toBeUndefined();
  });

  it('reports a played-out exchange once playback finishes, not when generation does', async () => {
    const h = harness();
    await h.controller.start();
    const live = h.sessions[0];

    live.emit({ serverContent: { inputTranscription: { text: 'Hello.' } } });
    live.emit(audio());
    live.emit({ serverContent: { outputTranscription: { text: 'Hi there.' } } });
    live.emit({ serverContent: { turnComplete: true } });
    expect(h.exchanges).toHaveLength(0);

    h.player.drain();
    expect(h.exchanges).toHaveLength(1);
    expect(h.exchanges[0].partner).toMatchObject({
      deliveredText: 'Hi there.',
      interrupted: false,
    });
  });

  it('streams mic audio to Gemini, and stops while muted', async () => {
    const h = harness();
    await h.controller.start();
    h.sendMic('pcm1');
    h.controller.setMuted(true);
    h.sendMic('pcm2');
    expect(h.sessions[0].session.sent).toEqual([
      { audio: { data: 'pcm1', mimeType: 'audio/pcm;rate=16000' } },
      { audioStreamEnd: true },
    ]);
  });

  it('cuts playback on a server interruption and drops the cancelled reply', async () => {
    const h = harness();
    await h.controller.start();
    const live = h.sessions[0];
    live.emit({ serverContent: { inputTranscription: { text: 'Why?' } } });
    live.emit(audio());
    live.emit({
      serverContent: { outputTranscription: { text: 'Because prices went up a lot.' } },
    });
    h.player.playedMs = 0;

    live.emit({ serverContent: { interrupted: true } });
    live.emit(audio()); // stale audio from the cancelled reply
    expect(h.exchanges).toHaveLength(1);
    expect(h.exchanges[0].partner).toMatchObject({
      interrupted: true,
      playbackCompleted: false,
      deliveredText: '',
    });
    expect(h.player.isPlaying).toBe(false);
  });

  it('treats talking over buffered audio as an interruption', async () => {
    const h = harness();
    await h.controller.start();
    const live = h.sessions[0];
    live.emit({ serverContent: { inputTranscription: { text: 'Go on.' } } });
    live.emit(audio());
    live.emit({ serverContent: { outputTranscription: { text: 'Here is a long answer.' } } });
    live.emit({ serverContent: { turnComplete: true } });
    live.emit({ serverContent: { inputTranscription: { text: 'Actually, wait.' } } });

    expect(h.exchanges).toHaveLength(1);
    expect(h.exchanges[0].partner.interrupted).toBe(true);
    expect(h.player.isPlaying).toBe(false);
  });

  it('reconnects with a fresh grant after a dropped connection, discarding the half exchange', async () => {
    const h = harness();
    await h.controller.start();
    h.sessions[0].emit({ serverContent: { inputTranscription: { text: 'Half a thought' } } });
    h.sessions[0].close(1011);
    await vi.waitFor(() => expect(h.sessions).toHaveLength(2));

    h.sessions[1].emit({ serverContent: { inputTranscription: { text: 'Fresh start.' } } });
    h.sessions[1].emit(audio());
    h.sessions[1].emit({ serverContent: { turnComplete: true } });
    h.player.drain();
    expect(h.exchanges.map((e) => e.participant.transcript)).toEqual(['Fresh start.']);
    expect(h.exchanges[0].voiceSessionVersion).toBe('v2');
    expect(h.statuses.map((s) => s.kind)).toEqual(['started', 'reconnecting', 'reconnected']);
  });

  it('gives up and offers text after repeated connection failures', async () => {
    const h = harness();
    await h.controller.start();
    for (let i = 0; i < 4; i++) {
      h.sessions[i].close(1011);
      if (i < 3) await vi.waitFor(() => expect(h.sessions).toHaveLength(i + 2));
    }
    await vi.waitFor(() => expect(h.fatal).toHaveLength(1));
    expect(h.fatal[0].kind).toBe('connection_lost');
    expect(h.statuses.at(-1)).toEqual({ kind: 'fell_back_to_text' });
    expect(h.mic.stop).toHaveBeenCalled();
  });

  it('falls back to text when the mic is refused', async () => {
    const h = harness({ micError: new DOMException('no', 'NotAllowedError') });
    await h.controller.start();
    expect(h.fatal[0].kind).toBe('mic_denied');
    expect(h.sessions).toHaveLength(0);
  });

  it('keeps what was heard when the participant ends voice mid-reply', async () => {
    const h = harness();
    await h.controller.start();
    const live = h.sessions[0];
    live.emit({ serverContent: { inputTranscription: { text: 'Bye.' } } });
    live.emit(audio());
    live.emit({ serverContent: { outputTranscription: { text: 'Okay, take care now.' } } });
    h.player.playedMs = 1000;

    h.controller.stop();
    expect(h.exchanges[0].partner).toMatchObject({
      interrupted: true,
      deliveredText: 'Okay, take care now.',
    });
    expect(live.session.closed).toBe(true);
    expect(h.mic.stop).toHaveBeenCalled();
    expect(h.player.closed).toBe(true);
  });
});
