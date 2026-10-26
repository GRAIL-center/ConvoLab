// Same values as MAX_TRANSCRIBE_SECONDS and TRANSCRIBE_SAMPLE_RATE in the
// voice contract. Copied, not imported: the app takes only types from the API.
const MAX_TRANSCRIBE_SECONDS = 90;
const TRANSCRIBE_SAMPLE_RATE = 16_000;
const BYTES_PER_MS = (TRANSCRIBE_SAMPLE_RATE * 2) / 1000;
const MAX_BYTES = MAX_TRANSCRIBE_SECONDS * TRANSCRIBE_SAMPLE_RATE * 2;

/**
 * RMS (0-1) above which a frame counts as speech. Low on purpose: the mic runs
 * with noise suppression, so silence sits far below it, and cutting quiet
 * speech would cost words.
 */
const SPEECH_RMS = 0.006;
/** Audio kept either side of the speech, so soft word edges survive the trim. */
const PAD_MS = 400;

interface Frame {
  bytes: Uint8Array;
  speech: boolean;
  /** Position in the stream, counting every frame ever pushed. */
  seq: number;
}

function decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encode(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000; // keeps String.fromCharCode under the argument limit
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function rms(bytes: Uint8Array): number {
  const samples = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length >> 1);
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length) / 32768;
}

/**
 * The mic audio of the participant's current turn, kept so the server can
 * transcribe it. Holds at most MAX_TRANSCRIBE_SECONDS, dropping the oldest
 * first, and tracks where the speech is so silence can be trimmed off and the
 * end of speech spotted without waiting for Gemini.
 */
export class TurnAudio {
  private frames: Frame[] = [];
  private bytes = 0;
  private nextSeq = 0;
  private speechBytes = 0;

  push(base64Pcm: string): void {
    const bytes = decode(base64Pcm);
    const speech = rms(bytes) >= SPEECH_RMS;
    this.frames.push({ bytes, speech, seq: this.nextSeq++ });
    this.bytes += bytes.length;
    if (speech) this.speechBytes += bytes.length;
    while (this.bytes > MAX_BYTES && this.frames.length > 1) {
      const dropped = this.frames.shift();
      if (!dropped) break;
      this.bytes -= dropped.bytes.length;
      if (dropped.speech) this.speechBytes -= dropped.bytes.length;
    }
  }

  /** Milliseconds of speech held. */
  get speechMs(): number {
    return this.speechBytes / BYTES_PER_MS;
  }

  /** Stream position of the last speech frame; changes whenever they speak again. -1 if none. */
  get lastSpeechSeq(): number {
    return this.lastSpeechIndex() === -1 ? -1 : this.frames[this.lastSpeechIndex()].seq;
  }

  /** Milliseconds of silence since the last speech; 0 if there has been none. */
  get silenceAfterSpeechMs(): number {
    const last = this.lastSpeechIndex();
    if (last === -1) return 0;
    let bytes = 0;
    for (let i = last + 1; i < this.frames.length; i++) bytes += this.frames[i].bytes.length;
    return bytes / BYTES_PER_MS;
  }

  /**
   * The speech so far, with the silence either side trimmed to PAD_MS, as one
   * base64 PCM16 clip. Null when nothing above the speech threshold was heard.
   * Leaves the audio in place.
   */
  clip(): string | null {
    const first = this.frames.findIndex((f) => f.speech);
    const last = this.lastSpeechIndex();
    if (first === -1) return null;
    const start = this.padIndex(first, -1);
    const end = this.padIndex(last, 1);
    let length = 0;
    for (let i = start; i <= end; i++) length += this.frames[i].bytes.length;
    const out = new Uint8Array(length);
    let offset = 0;
    for (let i = start; i <= end; i++) {
      out.set(this.frames[i].bytes, offset);
      offset += this.frames[i].bytes.length;
    }
    return encode(out);
  }

  /** Drop everything but the last `ms` of audio. */
  keepLast(ms: number): void {
    let kept = 0;
    let start = this.frames.length;
    while (start > 0 && kept < ms * BYTES_PER_MS) {
      start--;
      kept += this.frames[start].bytes.length;
    }
    for (const dropped of this.frames.splice(0, start)) {
      this.bytes -= dropped.bytes.length;
      if (dropped.speech) this.speechBytes -= dropped.bytes.length;
    }
  }

  clear(): void {
    this.frames = [];
    this.bytes = 0;
    this.speechBytes = 0;
  }

  private lastSpeechIndex(): number {
    for (let i = this.frames.length - 1; i >= 0; i--) if (this.frames[i].speech) return i;
    return -1;
  }

  /** Walk PAD_MS of frames out from `index` in `direction`, staying in range. */
  private padIndex(index: number, direction: 1 | -1): number {
    let i = index;
    let padded = 0;
    while (padded < PAD_MS * BYTES_PER_MS) {
      const next = i + direction;
      if (next < 0 || next >= this.frames.length) break;
      i = next;
      padded += this.frames[i].bytes.length;
    }
    return i;
  }
}
