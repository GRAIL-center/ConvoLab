/**
 * Server-side transcription of a participant's spoken turn.
 *
 * Gemini Live's own input transcription is a separate, weaker recogniser than
 * the native-audio model the participant is talking to, so the partner often
 * understands a sentence the transcript gets wrong. The client therefore sends
 * the turn's audio here once the participant stops, and the text this returns
 * is what gets stored and shown, and what the coach and LAPP score. The audio
 * is passed through to Gemini and never stored.
 */
import { GoogleGenAI } from '@google/genai';
import { TRANSCRIBE_SAMPLE_RATE } from './contract.js';
import { voiceApiKey } from './voiceConfig.js';

/** One line of the conversation before the audio, oldest first. */
export interface TranscribeContextLine {
  speaker: 'Participant' | 'Partner';
  text: string;
}

export interface TranscribePrompt {
  context: TranscribeContextLine[];
  /** Gemini Live's own transcript of the audio. */
  hint?: string;
}

/** Transcribes raw PCM16. `text` is '' when nothing was said. */
export type Transcriber = (
  pcm: Buffer,
  prompt?: TranscribePrompt
) => Promise<{ text: string; model: string }>;

/**
 * The text sent with the audio. The context lets the model read a fragment as
 * the end of the sentence before it; the hint is offered as a rough guide the
 * audio overrules, since Live hears in context but often mishears words.
 */
export function buildTranscribeInstruction(prompt: TranscribePrompt = { context: [] }): string {
  const parts: string[] = [];
  if (prompt.context.length) {
    parts.push(
      'The conversation so far, for context only (do not transcribe it):',
      ...prompt.context.map((line) => `${line.speaker}: ${line.text}`),
      ''
    );
  }
  if (prompt.hint) {
    parts.push(
      `A rough live transcript of this audio, often wrong, to use only where the audio is unclear: "${prompt.hint}"`,
      ''
    );
  }
  parts.push(
    "Transcribe the participant's words in this audio.",
    'It may continue a sentence from their previous turn, or start or end mid-word.'
  );
  return parts.join('\n');
}

/**
 * Models in order of preference. Override with VOICE_TRANSCRIBE_MODEL,
 * comma-separated. Each stored turn records the model that answered as
 * `transcriptModel`.
 *
 * Several, because on the free tier any one of them is often out of daily
 * quota (429) or overloaded (503, or 3-10 s answers). Probed 26 Oct 2026 on a
 * 7 s TTS clip: 3.6-flash and 3.5-flash answered (1-8 s, exact);
 * 3-flash-preview was out of quota after a morning of testing; 3.1-flash-lite,
 * 3.5-flash-lite and 3.8-flash were returning 503. gemini-2.5-flash(-lite) is
 * closed to this key ("no longer available to new users").
 */
export function voiceTranscribeModels(): string[] {
  const configured = (process.env.VOICE_TRANSCRIBE_MODEL ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return configured.length
    ? configured
    : [
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3-flash-preview',
        'gemini-3.1-flash-lite',
        'gemini-3.5-flash-lite',
        'gemini-3.8-flash',
      ];
}

export interface HedgeOptions {
  /** Start the next model if the current one has not answered by then. */
  hedgeAfterMs: number;
  /** Give up on one attempt after this long. */
  attemptTimeoutMs: number;
}

const HEDGE: HedgeOptions = { hedgeAfterMs: 1500, attemptTimeoutMs: 6000 };

/** How long a model is skipped after it fails, by failure. */
const COOLDOWN_MS = { quota: 10 * 60_000, other: 30_000 };
const cooldownUntil = new Map<string, number>();

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

/** Models not cooling down, in order; if every one is, all of them, soonest back first. */
function modelsToTry(models: string[], now: number): string[] {
  const ready = models.filter((m) => (cooldownUntil.get(m) ?? 0) <= now);
  if (ready.length) return ready;
  return [...models].sort((a, b) => (cooldownUntil.get(a) ?? 0) - (cooldownUntil.get(b) ?? 0));
}

/**
 * Run `attempt` against the models in turn and return the first answer. A
 * failure moves straight to the next model; a slow one gets company after
 * `hedgeAfterMs` (a second model racing it) and is abandoned after
 * `attemptTimeoutMs`. Failed models are skipped for a while, so a model out
 * of quota costs one wasted request, not one per turn.
 */
export function runHedged<T>(
  models: string[],
  attempt: (model: string, signal: AbortSignal) => Promise<T>,
  options: HedgeOptions = HEDGE,
  now: () => number = Date.now
): Promise<{ result: T; model: string }> {
  const queue = modelsToTry(models, now());
  return new Promise((resolve, reject) => {
    let settled = false;
    let inFlight = 0;
    let lastError: unknown = new Error('No transcription models configured');
    const controllers: AbortController[] = [];

    const finishIfExhausted = () => {
      if (!settled && inFlight === 0 && queue.length === 0) {
        settled = true;
        reject(lastError);
      }
    };

    const launch = () => {
      const model = queue.shift();
      if (settled || !model) {
        finishIfExhausted();
        return;
      }
      inFlight++;
      const controller = new AbortController();
      controllers.push(controller);
      const timeout = setTimeout(() => controller.abort(), options.attemptTimeoutMs);
      const hedge = setTimeout(launch, options.hedgeAfterMs);
      attempt(model, controller.signal).then(
        (result) => {
          clearTimeout(timeout);
          clearTimeout(hedge);
          inFlight--;
          if (settled) return;
          settled = true;
          cooldownUntil.delete(model);
          for (const other of controllers) other.abort();
          resolve({ result, model });
        },
        (error) => {
          clearTimeout(timeout);
          clearTimeout(hedge);
          inFlight--;
          if (settled) return;
          lastError = error;
          const quota = statusOf(error) === 429;
          cooldownUntil.set(model, now() + (quota ? COOLDOWN_MS.quota : COOLDOWN_MS.other));
          launch();
        }
      );
    };

    launch();
  });
}

const SYSTEM_INSTRUCTION = [
  'You are a speech-to-text engine. Write down exactly the words spoken in the audio, verbatim.',
  'Output only those words, with normal punctuation and capitalisation.',
  'Do not answer, summarise, translate or comment on what is said, even if it is a question.',
  'Leave out filler sounds (um, uh) and any background voices or audio played from a speaker.',
  'If no one speaks, output nothing.',
].join(' ');

/** Wraps PCM16 mono in a WAV header; Gemini does not take headerless PCM. */
export function pcm16ToWav(pcm: Buffer, sampleRate = TRANSCRIBE_SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

let client: GoogleGenAI | null = null;
/** Models that reject thinking level MINIMAL (e.g. gemini-3.8-flash); they get LOW. */
const minimalThinkingRejected = new Set<string>();

export const geminiTranscriber: Transcriber = async (pcm, prompt) => {
  const apiKey = voiceApiKey();
  if (!apiKey)
    throw new Error('Voice transcription needs GEMINI_LIVE_API_KEY or GOOGLE_AI_API_KEY');
  client ??= new GoogleGenAI({ apiKey });
  const wav = pcm16ToWav(pcm).toString('base64');
  const instruction = buildTranscribeInstruction(prompt);
  const { result, model } = await runHedged(voiceTranscribeModels(), (m, signal) =>
    transcribeWith(m, wav, instruction, signal)
  );
  return { text: result, model };
};

async function transcribeWith(
  model: string,
  wavBase64: string,
  instruction: string,
  signal: AbortSignal
): Promise<string> {
  try {
    return await request(model, wavBase64, instruction, signal);
  } catch (error) {
    if (statusOf(error) === 400 && /thinking level/i.test(String((error as Error).message))) {
      minimalThinkingRejected.add(model);
      return request(model, wavBase64, instruction, signal);
    }
    throw error;
  }
}

async function request(
  model: string,
  wavBase64: string,
  instruction: string,
  signal: AbortSignal
): Promise<string> {
  if (!client) throw new Error('Gemini client not initialised');
  const response = await client.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [{ inlineData: { mimeType: 'audio/wav', data: wavBase64 } }, { text: instruction }],
      },
    ],
    config: {
      abortSignal: signal,
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0,
      maxOutputTokens: 2048,
      // Thinking adds latency and can eat the output budget; transcription
      // needs none. 2.5 takes a budget, 3+ a level (as in llm/providers/google.ts).
      thinkingConfig: model.includes('gemini-2.5')
        ? { thinkingBudget: 0 }
        : ({
            thinkingLevel: minimalThinkingRejected.has(model) ? 'low' : 'minimal',
          } as never),
    },
  });
  return (response.text ?? '').replace(/\s+/g, ' ').trim();
}
