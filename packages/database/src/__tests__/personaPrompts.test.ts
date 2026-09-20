import { createHash } from 'node:crypto';
import type { PrismaClient } from '@workspace/database';
import { describe, expect, it, vi } from 'vitest';
import { FEMALE_MAGA_PROMPT } from '../../seed/prompts/femaleMaga';
import { FEMALE_PROGRESSIVE_PROMPT } from '../../seed/prompts/femaleProgressive';
import { MALE_MAGA_PROMPT } from '../../seed/prompts/maleMaga';
import { MALE_PROGRESSIVE_PROMPT } from '../../seed/prompts/maleProgressive';
import { seedReferenceData } from '../../seed/seedDatabase';

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
    expect(selfReference).toContain(`You are a ${persona.gender} and you use ${persona.pronouns} pronouns.`);
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
      'difficult-coworker',
    ]);
  });
});
