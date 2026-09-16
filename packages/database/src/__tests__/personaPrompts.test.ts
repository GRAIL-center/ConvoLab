import { createHash } from 'node:crypto';
import type { PrismaClient } from '@workspace/database';
import { describe, expect, it, vi } from 'vitest';
import { FEMALE_MAGA_PROMPT } from '../../seed/prompts/femaleMaga';
import { FEMALE_PROGRESSIVE_PROMPT } from '../../seed/prompts/femaleProgressive';
import { MALE_MAGA_PROMPT } from '../../seed/prompts/maleMaga';
import { MALE_PROGRESSIVE_PROMPT } from '../../seed/prompts/maleProgressive';
import { renamePersona, seedReferenceData } from '../../seed/seedDatabase';

const personas = [
  {
    name: 'Mark Johnson',
    slug: 'progressive-left-male',
    gender: 'man',
    pronouns: 'he/him',
    prompt: MALE_PROGRESSIVE_PROMPT,
    digest: '2f86945b3e7b1dfe67db06dc334e060d2e0ac0cb61edbe0486d7804d46195913',
  },
  {
    name: 'Megan Johnson',
    slug: 'progressive-left-female',
    gender: 'woman',
    pronouns: 'she/her',
    prompt: FEMALE_PROGRESSIVE_PROMPT,
    digest: 'd9b6367df883fb4e20cf83d4054d8dbd05de3ca2c17e3839ee59bd2bc5943f55',
  },
  {
    name: 'Mark Johnson',
    slug: 'populist-right-male',
    gender: 'man',
    pronouns: 'he/him',
    prompt: MALE_MAGA_PROMPT,
    digest: 'b6572fb8c776cf3fe92184ec0168ab220af64e06339c7ead1260dcacb4703c69',
  },
  {
    name: 'Megan Johnson',
    slug: 'populist-right-female',
    gender: 'woman',
    pronouns: 'she/her',
    prompt: FEMALE_MAGA_PROMPT,
    digest: 'beaea1fed35c9a28e42902fe59ea526b5386509cd8da71444890b789bbeb9037',
  },
];

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
  it.each(personas)('preserves the complete PDF text for $slug', ({ prompt, digest }) => {
    const normalized = prompt.replace(/\s+/g, ' ').trim();
    expect(createHash('sha256').update(normalized).digest('hex')).toBe(digest);
  });

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
