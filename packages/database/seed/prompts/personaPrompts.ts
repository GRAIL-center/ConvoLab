import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Persona prompts, stored as plain text beside this module
 * (`seed/prompts/<name>.txt`) so a prompt revision is a readable text diff
 * rather than an edit inside a TypeScript template string.
 *
 * Sources include the four "Newest Version" study files and the supplied Angry
 * Uncle persona. Preserve the source wording; only repository text-file
 * formatting (ROLE: first, LF line endings, one trailing newline) is normalized.
 *
 * The files are read relative to this module, so the same code works when it
 * runs from source (tsx, Vitest) and from the compiled `dist/seed/prompts/`
 * (production). `tsc` does not copy .txt files; the package's `build` script
 * does (see scripts/copyPrompts.mjs). A missing file throws at import time,
 * so a build that forgot them fails on startup, not with an empty prompt.
 */
export const PERSONA_PROMPT_FILES = [
  'maleMaga',
  'femaleMaga',
  'maleProgressive',
  'femaleProgressive',
] as const;

export type PersonaPromptFile = (typeof PERSONA_PROMPT_FILES)[number];

export const GENERAL_PERSONA_PROMPT_FILES = ['angryUncle'] as const;
export const ALL_PERSONA_PROMPT_FILES = [
  ...PERSONA_PROMPT_FILES,
  ...GENERAL_PERSONA_PROMPT_FILES,
] as const;
export type AllPersonaPromptFile = (typeof ALL_PERSONA_PROMPT_FILES)[number];

export const PERSONA_PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));

export function personaPromptPath(name: AllPersonaPromptFile): string {
  return join(PERSONA_PROMPTS_DIR, `${name}.txt`);
}

export function loadPersonaPrompt(name: AllPersonaPromptFile): string {
  // Files end with a single newline, as text files should (editors and the
  // pull command add one); the prompt itself does not, so strip exactly one.
  return readFileSync(personaPromptPath(name), 'utf8').replace(/\r?\n$/, '');
}

export const MALE_MAGA_PROMPT = loadPersonaPrompt('maleMaga');
export const FEMALE_MAGA_PROMPT = loadPersonaPrompt('femaleMaga');
export const MALE_PROGRESSIVE_PROMPT = loadPersonaPrompt('maleProgressive');
export const FEMALE_PROGRESSIVE_PROMPT = loadPersonaPrompt('femaleProgressive');
export const ANGRY_UNCLE_PROMPT = loadPersonaPrompt('angryUncle');
