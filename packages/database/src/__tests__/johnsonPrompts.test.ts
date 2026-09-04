import { createHash } from 'node:crypto';
import type { PrismaClient } from '@workspace/database';
import { describe, expect, it, vi } from 'vitest';
import { MARCUS_JOHNSON_PROMPT } from '../../seed/prompts/marcusJohnson';
import { MAYA_JOHNSON_PROMPT } from '../../seed/prompts/mayaJohnson';
import { seedReferenceData } from '../../seed/seedDatabase';

const personas = [
  {
    name: 'Marcus Johnson',
    slug: 'progressive-left-male',
    gender: 'man',
    pronouns: 'he/him',
    prompt: MARCUS_JOHNSON_PROMPT,
    // SHA-256 of the complete source PDF text with whitespace normalized.
    digest: '9dad4dd01bacb14777682bf3af341b4772bddef54f18609e8048f8ca10446f2f',
  },
  {
    name: 'Maya Johnson',
    slug: 'progressive-left-female',
    gender: 'woman',
    pronouns: 'she/her',
    prompt: MAYA_JOHNSON_PROMPT,
    digest: '7f7022c481fd372fee2014e8cfd1f78ede3f165cd271e59bad54aa125a4373b9',
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

describe('supplied Johnson persona prompts', () => {
  it.each(personas)('preserves the complete PDF text for $name', ({ prompt, digest }) => {
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

  it('leaves all other scenario mappings intact', async () => {
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
