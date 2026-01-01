import type { PrismaClient } from '@workspace/database';

/**
 * Create a minimal test scenario with all required fields.
 */
export async function createTestScenario(
  prisma: PrismaClient,
  overrides: Partial<{
    name: string;
    slug: string;
    description: string;
    partnerPersona: string;
    partnerSystemPrompt: string;
    coachSystemPrompt: string;
  }> = {},
  seed = 1
) {
  return prisma.scenario.create({
    data: {
      name: overrides.name ?? `Test Scenario ${seed}`,
      slug: overrides.slug ?? `test-scenario-${seed}`,
      description: overrides.description ?? 'A test scenario for unit tests',
      partnerPersona: overrides.partnerPersona ?? 'Test partner persona',
      partnerSystemPrompt: overrides.partnerSystemPrompt ?? 'You are a test partner.',
      coachSystemPrompt: overrides.coachSystemPrompt ?? 'You are a test coach.',
    },
  });
}
