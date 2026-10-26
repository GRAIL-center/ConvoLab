/**
 * Local debugging of voice transcription: with VOICE_TRANSCRIBE_DEBUG_DIR set,
 * each clip sent for transcription is written there as a WAV, next to a JSON
 * file with the prompt context and what came back. Off by default and refused
 * in production: participant audio is never kept (docs/plans/19-voice-mode.md).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pcm16ToWav } from './transcribe.js';

export function transcribeDebugDir(): string | null {
  const dir = process.env.VOICE_TRANSCRIBE_DEBUG_DIR?.trim();
  if (!dir || process.env.NODE_ENV === 'production') return null;
  return dir;
}

export async function saveTranscribeDebug(
  dir: string,
  requestId: string,
  pcm: Buffer,
  details: Record<string, unknown>
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const stem = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${requestId}`);
  await writeFile(`${stem}.wav`, pcm16ToWav(pcm));
  await writeFile(
    `${stem}.json`,
    JSON.stringify({ requestId, seconds: pcm.length / 32_000, ...details }, null, 2)
  );
}
