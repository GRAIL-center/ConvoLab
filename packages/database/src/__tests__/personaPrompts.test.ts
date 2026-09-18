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
    digest: '07bfce05af6059b93a465445ea7e3b5c3b7b297de732ff9677dcff7bd5819822',
  },
  {
    name: 'Megan Johnson',
    slug: 'progressive-left-female',
    gender: 'woman',
    pronouns: 'she/her',
    prompt: FEMALE_PROGRESSIVE_PROMPT,
    digest: 'bd0f2ab9709267e0d2bd3aca706b95a14289fbed5f239ed0fb1b21dbdd88af4e',
  },
  {
    name: 'Mark Johnson',
    slug: 'populist-right-male',
    gender: 'man',
    pronouns: 'he/him',
    prompt: MALE_MAGA_PROMPT,
    digest: 'eb86fd5a97e969ae640064aa66aeee428b7058f4cb878009dca4b2427e88da5f',
  },
  {
    name: 'Megan Johnson',
    slug: 'populist-right-female',
    gender: 'woman',
    pronouns: 'she/her',
    prompt: FEMALE_MAGA_PROMPT,
    digest: 'a3ff4443d6edaef81702c626aef4ea5ffb1516809894b09ca6c9f368fd45d960',
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
