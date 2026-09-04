import { createHash } from 'node:crypto';
import type { PrismaClient } from '@workspace/database';
import { describe, expect, it, vi } from 'vitest';
import { MAX_BRIGGS_PROMPT } from '../../seed/prompts/maxBriggs';
import { MEGAN_BRIGGS_PROMPT } from '../../seed/prompts/meganBriggs';
import { seedReferenceData } from '../../seed/seedDatabase';

const personas = [
  {
    name: 'Max Briggs',
    slug: 'populist-right-male',
    gender: 'man',
    pronouns: 'he/him',
    prompt: MAX_BRIGGS_PROMPT,
    // SHA-256 of the complete source PDF text with whitespace normalized.
    digest: 'd040d25fc4563cdc3277c89520eadd89613cda39630e894980de27472cb8adf9',
  },
  {
    name: 'Megan Briggs',
    slug: 'populist-right-female',
    gender: 'woman',
    pronouns: 'she/her',
    prompt: MEGAN_BRIGGS_PROMPT,
    digest: '910a5168f28248af2521212555d94902c61adf4a2b76a172103d2fd2390cd167',
  },
];

async function captureScenarios() {
  const scenarioUpsert = vi.fn().mockResolvedValue({});
  // No client initialization, credentials, or database connection is needed.
  const client = {
    quotaPreset: { upsert: vi.fn().mockResolvedValue({}) },
    scenario: { upsert: scenarioUpsert },
  } as unknown as PrismaClient;
  await seedReferenceData(client, { log: () => {} });
  return scenarioUpsert.mock.calls.map(([args]) => args);
}

describe('supplied Briggs persona prompts', () => {
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
    expect(update.partnerSystemPrompt).not.toContain('RESPONSE LENGTH:');
    expect(update.coachSystemPrompt).toContain('You are a conversation coach');
  });

  it('retains the other scenarios and their existing response-length policy', async () => {
    const calls = await captureScenarios();
    expect(calls.map((args) => args.where.slug)).toEqual([
      'angry-uncle-thanksgiving',
      'progressive-left-male',
      'progressive-left-female',
      'populist-right-male',
      'populist-right-female',
      'difficult-coworker',
    ]);
    for (const args of calls.filter((item) => item.where.slug.startsWith('progressive-left'))) {
      expect(args.update.partnerSystemPrompt).toContain('RESPONSE LENGTH:');
    }
  });
});
