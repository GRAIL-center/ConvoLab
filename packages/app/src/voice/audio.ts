/**
 * Browser audio for voice mode: 16 kHz PCM16 microphone capture for Gemini
 * Live input, and gapless playback of its 24 kHz PCM16 output.
 */

const INPUT_RATE = 16_000;
const OUTPUT_RATE = 24_000;

// Runs on the audio thread. Resamples whatever rate the device runs at down to
// 16 kHz (Firefox will not connect a mic to a context at a different rate, so
// the context stays at the device rate) and posts ~100 ms Float32 frames.
const CAPTURE_WORKLET = `
class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${INPUT_RATE};
    this.pos = 0;
    this.buf = [];
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    while (this.pos < ch.length) {
      const i = Math.floor(this.pos);
      const f = this.pos - i;
      const a = ch[i];
      const b = i + 1 < ch.length ? ch[i + 1] : a;
      this.buf.push(a + (b - a) * f);
      this.pos += this.ratio;
    }
    this.pos -= ch.length;
    if (this.buf.length >= ${INPUT_RATE / 10}) {
      this.port.postMessage(new Float32Array(this.buf));
      this.buf = [];
    }
    return true;
  }
}
registerProcessor('convolab-capture', Capture);
`;

function floatToPcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function pcm16Base64ToFloat(data: string): Float32Array<ArrayBuffer> {
  const binary = atob(data);
  const samples = new Float32Array(binary.length / 2);
  for (let i = 0; i < samples.length; i++) {
    const lo = binary.charCodeAt(i * 2);
    const hi = binary.charCodeAt(i * 2 + 1);
    let v = (hi << 8) | lo;
    if (v >= 0x8000) v -= 0x10000;
    samples[i] = v / 0x8000;
  }
  return samples;
}

export const INPUT_MIME = `audio/pcm;rate=${INPUT_RATE}`;

export interface MicCapture {
  /** Stop sending frames without releasing the mic. */
  setMuted(muted: boolean): void;
  stop(): void;
}

/**
 * Opens the mic with the browser's echo cancellation and noise suppression on
 * (they keep the partner's voice from laptop speakers being heard as the
 * participant). `onFrame` gets base64 PCM16 at 16 kHz; `onLevel` a 0-1 RMS level.
 * Throws a DOMException named NotAllowedError when permission is refused.
 */
export async function startMicCapture(handlers: {
  onFrame: (base64Pcm: string) => void;
  onLevel?: (level: number) => void;
  onEnded?: () => void;
}): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  });
  const ctx = new AudioContext();
  const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'application/javascript' }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'convolab-capture');
  let muted = false;

  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const frame = event.data;
    if (handlers.onLevel) {
      let sum = 0;
      for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
      handlers.onLevel(muted ? 0 : Math.min(1, Math.sqrt(sum / frame.length) * 4));
    }
    if (!muted) handlers.onFrame(floatToPcm16Base64(frame));
  };
  source.connect(node);

  // An unplugged mic ends its track; tell the caller rather than go silent.
  for (const track of stream.getAudioTracks()) {
    track.addEventListener('ended', () => handlers.onEnded?.());
  }

  return {
    setMuted(value) {
      muted = value;
      for (const track of stream.getAudioTracks()) track.enabled = !value;
    },
    stop() {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      for (const track of stream.getTracks()) track.stop();
      void ctx.close();
    },
  };
}

/**
 * Gapless player for the partner's audio. Tracks, per partner turn, how much
 * audio arrived and how much of it has played, which is what the delivered-text
 * estimate needs.
 */
export class PcmPlayer {
  private readonly ctx = new AudioContext({ sampleRate: OUTPUT_RATE });
  private readonly sources = new Set<AudioBufferSourceNode>();
  private nextStart = 0;
  private turnStart: number | null = null;
  private receivedSec = 0;
  /** Called when the queue runs dry, i.e. everything received has played. */
  onDrained: (() => void) | null = null;

  /** Browsers start audio contexts suspended until a user gesture; call from one. */
  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  enqueue(base64Pcm: string): void {
    const samples = pcm16Base64ToFloat(base64Pcm);
    if (samples.length === 0) return;
    const buffer = this.ctx.createBuffer(1, samples.length, OUTPUT_RATE);
    buffer.copyToChannel(samples, 0);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);

    const startAt = Math.max(this.nextStart, this.ctx.currentTime);
    this.turnStart ??= startAt;
    this.nextStart = startAt + buffer.duration;
    this.receivedSec += buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      if (this.sources.size === 0) this.onDrained?.();
    };
    source.start(startAt);
  }

  get isPlaying(): boolean {
    return this.sources.size > 0;
  }

  get playedMs(): number {
    if (this.turnStart === null) return 0;
    const played = (this.ctx.currentTime - this.turnStart) * 1000;
    return Math.max(0, Math.min(played, this.receivedSec * 1000));
  }

  get receivedMs(): number {
    return this.receivedSec * 1000;
  }

  /** Cut playback now (barge-in). Returns what had played. */
  interrupt(): { playedMs: number; receivedMs: number } {
    const result = { playedMs: this.playedMs, receivedMs: this.receivedMs };
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.sources.clear();
    this.nextStart = this.ctx.currentTime;
    return result;
  }

  /** Start counting a new partner turn. */
  resetTurn(): void {
    this.turnStart = null;
    this.receivedSec = 0;
  }

  close(): void {
    this.interrupt();
    void this.ctx.close();
  }
}
