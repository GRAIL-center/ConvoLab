import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { PrismaClient } from '@workspace/database';
import { describe, expect, it, vi } from 'vitest';
import {
  FEMALE_MAGA_PROMPT,
  FEMALE_PROGRESSIVE_PROMPT,
  MALE_MAGA_PROMPT,
  MALE_PROGRESSIVE_PROMPT,
  PERSONA_PROMPT_FILES,
  PERSONA_PROMPTS_DIR,
  personaPromptPath,
} from '../../seed/prompts/personaPrompts.js';
import { renamePersona, seedReferenceData } from '../../seed/seedDatabase.js';
import { competingLengthRules } from './competingLengthRules.js';

const personas = [
  {
    name: 'Mark Johnson',
    slug: 'progressive-left-male',
    file: 'maleProgressive',
    gender: 'man',
    pronouns: 'he/him',
    prompt: MALE_PROGRESSIVE_PROMPT,
  },
  {
    name: 'Megan Johnson',
    slug: 'progressive-left-female',
    file: 'femaleProgressive',
    gender: 'woman',
    pronouns: 'she/her',
    prompt: FEMALE_PROGRESSIVE_PROMPT,
  },
  {
    name: 'Mark Johnson',
    slug: 'populist-right-male',
    file: 'maleMaga',
    gender: 'man',
    pronouns: 'he/him',
    prompt: MALE_MAGA_PROMPT,
  },
  {
    name: 'Megan Johnson',
    slug: 'populist-right-female',
    file: 'femaleMaga',
    gender: 'woman',
    pronouns: 'she/her',
    prompt: FEMALE_MAGA_PROMPT,
  },
] as const;

// The prompt text lives in seed/prompts/*.txt. These checks replace the old
// per-prompt sha256 pin (which guarded a hand transcription from the PDFs):
// they catch the ways a copy-paste from the source document goes wrong
// without pinning the wording, so a deliberate revision needs no hash update.
// seededPromptsUnchanged.test.ts separately proves the move to .txt changed
// no seeded prompt.
describe('persona prompt text files', () => {
  const read = (file: string) => readFileSync(`${PERSONA_PROMPTS_DIR}/${file}.txt`, 'utf8');

  it('the prompts directory holds exactly the four persona files', () => {
    const txt = readdirSync(PERSONA_PROMPTS_DIR).filter((f) => f.endsWith('.txt'));
    expect(txt.sort()).toEqual(PERSONA_PROMPT_FILES.map((f) => `${f}.txt`).sort());
  });

  it.each(PERSONA_PROMPT_FILES)('%s.txt exists and is non-empty', (file) => {
    expect(existsSync(personaPromptPath(file))).toBe(true);
    expect(read(file).trim().length).toBeGreaterThan(1000);
  });

  it.each(personas)('$file.txt is what the seed loads for $slug', ({ file, prompt }) => {
    // The loader strips the file's single trailing newline.
    expect(prompt).toBe(read(file).replace(/\n$/, ''));
  });

  it.each(PERSONA_PROMPT_FILES)('%s.txt has no stray whitespace', (file) => {
    const text = read(file);
    expect(text, 'Windows line endings (CR)').not.toMatch(/\r/);
    expect(text, 'leading whitespace').toBe(text.trimStart());
    // Exactly one trailing newline: text files end with one (editors and the
    // pull command add it) and the loader strips exactly one, so the seeded
    // prompt stays byte-identical to the original template strings.
    expect(text, 'file must end with exactly one newline').toBe(`${text.trimEnd()}\n`);
    const badLines = text
      .split('\n')
      .flatMap((line, i) => (/[ \t]+$/.test(line) ? [`${file}.txt:${i + 1}`] : []));
    expect(badLines, 'lines ending in spaces or tabs').toEqual([]);
  });

  it.each(PERSONA_PROMPT_FILES)('%s.txt starts with ROLE:', (file) => {
    const firstLine = read(file)
      .split('\n')
      .find((line) => line.trim() !== '');
    expect(firstLine?.trim()).toBe('ROLE:');
  });

  it.each(PERSONA_PROMPT_FILES)('%s.txt has no em or en dash', (file) => {
    const offenders = read(file)
      .split('\n')
      .flatMap((line, i) => (/[\u2013\u2014]/.test(line) ? [`${file}.txt:${i + 1}: ${line}`] : []));
    expect(offenders).toEqual([]);
  });

  it.each(PERSONA_PROMPT_FILES)('%s.txt has no competing reply-length rule', (file) => {
    expect(competingLengthRules(`${file}.txt`, read(file))).toEqual([]);
  });

  it.each(PERSONA_PROMPT_FILES)('%s.txt keeps the standardized family biography', (file) => {
    const text = read(file);
    expect(text).toContain('Age: 39');
    expect(text).toContain('Parent of two children, ages 9 and 6.');
  });

  it.each(PERSONA_PROMPT_FILES)('%s.txt keeps the shared conversation safeguards', (file) => {
    const text = read(file);
    expect(text).toContain('do not rely on stale assumptions.');
    expect(text).toContain('Do not state uncertain factual generalizations as settled facts');
    expect(text).toContain('Do not rely on the same acknowledgment phrases repeatedly.');
    expect(text).toContain('narrow factual, tactical, or implementation concessions');
    expect(text).toContain(
      'Factual learning, rapport, friendship, empathy, or repeated narrow concessions should not gradually change'
    );
    expect(text).toContain('The conversation should feel like two real people texting.');
  });

  // Partner gender is a randomised factor, so within each ideology the male
  // and female prompts must differ in gender alone (the principle behind the
  // gender-only SELF-REFERENCE idiom rule in seedDatabase.ts, and PR #106's
  // "differ only in the name" check between pilot and public copies).
  // Names and pronouns are neutralised: "Mark"/"Megan" and "he"/"she" become
  // one token (the source sometimes says "Mark ... Mark" in one prompt where
  // the other says "Megan ... she"), object and possessive forms another, and
  // reflexives a third. Whitespace runs are collapsed because the PDFs wrap
  // lines at different points.
  const neutralise = (text: string) =>
    text
      .replace(/\b(?:Mark|Megan|[Hh]e|[Ss]he)\b/g, 'REF')
      .replace(/\b(?:[Hh]im|[Hh]is|[Hh]er|[Hh]ers)\b/g, 'REF_OBJ')
      .replace(/\b(?:[Hh]imself|[Hh]erself)\b/g, 'REF_SELF')
      .replace(/\s+/g, ' ')
      .trim();

  it.each([
    ['maleProgressive', 'femaleProgressive'],
    ['maleMaga', 'femaleMaga'],
  ] as const)('%s and %s differ only in name and pronouns', (male, female) => {
    const a = neutralise(read(male)).split(/(?<=[.:?!]) /);
    const b = neutralise(read(female)).split(/(?<=[.:?!]) /);
    const onlyInMale = a.filter((s, i) => s !== b[i]);
    expect(onlyInMale, 'first sentences that differ (male side)').toEqual([]);
    expect(b.length).toBe(a.length);
  });
});

async function captureScenarios() {
  const scenarioUpsert = vi.fn().mockResolvedValue({});
  const client = {
    quotaPreset: { upsert: vi.fn().mockResolvedValue({}) },
    scenario: { upsert: scenarioUpsert },
  } as unknown as PrismaClient;
  await seedReferenceData(client, { log: () => {} });
  return scenarioUpsert.mock.calls.map(([args]) => args);
}

describe('supplied persona prompts', () => {
  it.each(personas)('updates the existing $slug scenario', async (persona) => {
    const calls = await captureScenarios();
    const matches = calls.filter((args) => args.where.slug === persona.slug);
    expect(matches).toHaveLength(1);
    const { create, update } = matches[0];
    expect(update).toEqual(create);
    expect(update).toMatchObject({
      name: persona.name,
      partnerPersona: persona.name,
      partnerModel: 'claude-sonnet-5',
      partnerUseWebSearch: true,
      coachUseWebSearch: false,
      isActive: true,
    });
    const [source, selfReference] = update.partnerSystemPrompt.split('\n\nSELF-REFERENCE:\n');
    expect(source).toBe(persona.prompt);
    expect(selfReference).toContain(
      `You are a ${persona.gender} and you use ${persona.pronouns} pronouns.`
    );
    expect(update.coachSystemPrompt).toContain('You are a conversation coach');
  });

  it('leaves the non-study scenarios mapped to their existing slugs', async () => {
    const calls = await captureScenarios();
    expect(calls.map((args) => args.where.slug)).toEqual([
      'angry-uncle-thanksgiving',
      'progressive-left-male',
      'progressive-left-female',
      'populist-right-male',
      'populist-right-female',
      'general-progressive-male',
      'general-progressive-female',
      'general-populist-male',
      'general-populist-female',
      'difficult-coworker',
    ]);
  });

  it.each(personas)('marks the pilot $slug scenario as pilot-only', async (persona) => {
    const calls = await captureScenarios();
    const [{ update }] = calls.filter((args) => args.where.slug === persona.slug);
    expect(update.audience).toBe('pilot');
  });
});

const generalPersonas = [
  {
    slug: 'general-progressive-male',
    name: 'Joshua Moore',
    first: 'Joshua',
    pilot: personas[0],
  },
  {
    slug: 'general-progressive-female',
    name: 'Emily Davis',
    first: 'Emily',
    pilot: personas[1],
  },
  { slug: 'general-populist-male', name: 'Ryan Taylor', first: 'Ryan', pilot: personas[2] },
  {
    slug: 'general-populist-female',
    name: 'Ashley Brown',
    first: 'Ashley',
    pilot: personas[3],
  },
];

describe('public-app persona copies', () => {
  it.each(generalPersonas)('$slug is the pilot prompt under the name $name', async (general) => {
    const calls = await captureScenarios();
    const matches = calls.filter((args) => args.where.slug === general.slug);
    expect(matches).toHaveLength(1);
    const { update } = matches[0];
    expect(update).toMatchObject({
      name: general.name,
      partnerPersona: general.name,
      partnerModel: 'claude-sonnet-5',
      audience: 'general',
    });

    const [source] = update.partnerSystemPrompt.split('\n\nSELF-REFERENCE:\n');
    const pilotFirst = general.pilot.name.split(' ')[0];
    // Same text as the pilot prompt apart from the name: renaming back must
    // reproduce the supplied PDF text exactly.
    const restored = source
      .replaceAll(general.name, general.pilot.name)
      .replaceAll(new RegExp(`\\b${general.first}\\b`, 'g'), pilotFirst);
    expect(restored).toBe(general.pilot.prompt);
    // And no trace of the pilot name survives in the public copy.
    expect(source).not.toMatch(/\bJohnson\b/);
    expect(source).not.toMatch(new RegExp(`\\b${pilotFirst}\\b`));
    expect(source).toContain(general.name);
  });
});

describe('renamePersona', () => {
  it('renames whole words only and leaves the common noun alone', () => {
    const out = renamePersona(
      "Mark Johnson is here. Mark's view: no quotation marks. Ask Mark a question.",
      { first: 'Mark', last: 'Johnson' },
      { first: 'Joshua', last: 'Moore' }
    );
    expect(out).toBe(
      "Joshua Moore is here. Joshua's view: no quotation marks. Ask Joshua a question."
    );
  });

  it('throws if the old surname survives', () => {
    expect(() =>
      renamePersona(
        'Mr. Johnson and Mark.',
        { first: 'Mark', last: 'Johnson' },
        { first: 'J', last: 'M' }
      )
    ).toThrow(/still present/);
  });
});
