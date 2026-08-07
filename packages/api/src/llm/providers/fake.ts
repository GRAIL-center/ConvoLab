import type { LLMProvider, StreamChunk, StreamParams } from '../types.js';

/**
 * Offline deterministic provider for pipeline testing and synthetic-data dry
 * runs (model strings like "fake:partner"). No network, no API keys. Output
 * varies with the input hash so transcripts aren't degenerate, but the same
 * input always yields the same output.
 */

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PARTNER_LINES = [
  "Well, that's not how I see it at all. Where I live, things have only gotten harder, and nobody in Washington seems to care.",
  'I hear that a lot on the news, but honestly the folks I know are just trying to keep their jobs and pay their bills.',
  "Look, I don't trust either party much, but at least someone is finally saying what people around here actually think.",
  "You always bring up studies and experts. My experience counts for something too, doesn't it?",
  "Maybe. I just think people like us get talked down to a lot, and I'm tired of it.",
];

const COACH_LINES = [
  'Nice work reflecting their concern before answering; next time, try naming the feeling behind their words too.',
  'You pivoted quickly to your own view — pause first and ask one curious question about their experience.',
  'Good acknowledgment of their values; consider sharing a personal story rather than a statistic next.',
  'Your tone stayed warm under pressure. Build on that by inviting them to say more before you respond.',
];

const USER_LINES = [
  "I hear you that things feel harder lately. What's changed the most for you personally?",
  "That makes sense. I guess I read different sources, but I want to understand what you're seeing day to day.",
  "I don't want to talk down to you — your experience matters to me. Can you tell me more about the job situation there?",
  "Okay, that's fair. I think we both want the same security for our families, we just disagree on how to get there.",
  'When you say nobody cares, who do you feel has let you down the most?',
];

function pick(lines: string[], seed: number): string {
  return lines[seed % lines.length];
}

function fakeLappJson(seed: number): string {
  const score = (offset: number) => 1 + ((seed >> offset) % 5);
  const tones = ['constructive', 'warm', 'neutral', 'tense'];
  return JSON.stringify({
    l: score(2),
    a: score(5),
    p: score(8),
    pe: score(11),
    tone: tones[seed % tones.length],
  });
}

export const fakeProvider: LLMProvider = {
  id: 'fake',

  async *streamCompletion(params: StreamParams): AsyncIterable<StreamChunk> {
    const transcript = params.messages.map((m) => `${m.role}:${m.content}`).join('|');
    const seed = hashString(params.model + transcript);

    let content: string;
    if (params.responseMimeType === 'application/json') {
      content = fakeLappJson(seed);
    } else if (params.model.includes('coach')) {
      content = pick(COACH_LINES, seed);
    } else if (params.model.includes('participant') || params.model.includes('user')) {
      content = pick(USER_LINES, seed);
    } else {
      content = pick(PARTNER_LINES, seed);
    }

    // Stream in two chunks so delta handling is exercised
    const mid = Math.ceil(content.length / 2);
    yield { type: 'delta', content: content.slice(0, mid) };
    yield { type: 'delta', content: content.slice(mid) };
    yield {
      type: 'done',
      usage: {
        inputTokens: Math.ceil(transcript.length / 4),
        outputTokens: Math.ceil(content.length / 4),
      },
    };
  },
};
