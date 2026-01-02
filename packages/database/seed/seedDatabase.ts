import type { PrismaClient } from '@prisma/client';
import { Role } from '@prisma/client';

const TEST_ADMIN_ID = 'test-admin-user';

const QUOTA_PRESETS = [
  {
    name: 'quick-chat',
    label: 'Quick chat',
    description: 'Brief exploration of a scenario',
    quota: { tokens: 10000 },
    sortOrder: 0,
  },
  {
    name: 'short-conversation',
    label: 'Short conversation',
    description: 'Standard conversation length',
    quota: { tokens: 25000 },
    isDefault: true,
    sortOrder: 1,
  },
  {
    name: 'therapy-session',
    label: 'Therapy session',
    description: 'Extended deep-dive conversation',
    quota: { tokens: 50000 },
    sortOrder: 2,
  },
];

const SCENARIOS = [
  {
    name: 'Angry Uncle at Thanksgiving',
    slug: 'angry-uncle-thanksgiving',
    description:
      'Practice navigating political disagreements with a family member during a holiday dinner.',
    partnerPersona: 'Your uncle who has strong political opinions',
    partnerSystemPrompt: `You are playing the role of an uncle at a Thanksgiving dinner who has strong, contentious political views. You're not trying to be mean, but you're passionate and can get worked up. You make sweeping statements and sometimes interrupt. However, you do care about your family and can be reasoned with if approached thoughtfully.

Start the conversation with a provocative political statement about current events.`,
    coachSystemPrompt: `You are a conversation coach helping the user navigate a difficult political conversation with their uncle at Thanksgiving. Your role is to:

1. Observe the conversation between the user and their uncle
2. Provide real-time guidance on de-escalation techniques
3. Suggest empathetic responses
4. Point out opportunities to find common ground
5. Help the user maintain boundaries while preserving the relationship

Be concise and actionable in your coaching. Focus on what the user should do next, not lengthy explanations.`,
  },
  {
    name: 'Difficult Coworker Feedback',
    slug: 'difficult-coworker',
    description:
      'Practice giving constructive feedback to a defensive coworker about missed deadlines.',
    partnerPersona: 'A coworker who becomes defensive when receiving feedback',
    partnerSystemPrompt: `You are a coworker who tends to get defensive when receiving criticism. You're actually insecure about your performance and worry about being judged. When someone brings up issues with your work, you:
- Initially make excuses or deflect
- May become emotional or accusatory
- Eventually can be reached if the other person is patient and empathetic

You're not a bad person - you're just struggling and don't have great coping mechanisms.`,
    coachSystemPrompt: `You are a conversation coach helping the user give difficult feedback to a defensive coworker. Your role is to:

1. Guide them to use "I" statements rather than accusatory language
2. Help them acknowledge the coworker's emotions
3. Suggest focusing on specific behaviors, not character
4. Encourage separating the person from the problem
5. Help them work toward collaborative solutions

Be supportive and remind them that defensive reactions are normal. Coach them through staying calm and empathetic.`,
  },
];

export interface SeedOptions {
  log?: (message: string) => void;
}

/**
 * Seeds the database with initial data (quota presets, scenarios, test admin).
 * Safe to call multiple times - uses upserts.
 */
export async function seedDatabase(prisma: PrismaClient, options: SeedOptions = {}) {
  const log = options.log ?? console.log;

  // Create quota presets
  for (const preset of QUOTA_PRESETS) {
    await prisma.quotaPreset.upsert({
      where: { name: preset.name },
      update: preset,
      create: preset,
    });
  }
  log(`Created quota presets: ${QUOTA_PRESETS.map((p) => p.name).join(', ')}`);

  // Create test admin user
  const adminUser = await prisma.user.upsert({
    where: { id: TEST_ADMIN_ID },
    update: {},
    create: {
      id: TEST_ADMIN_ID,
      name: 'Test Admin',
      role: Role.ADMIN,
    },
  });

  // Add email contact method for admin
  await prisma.contactMethod.upsert({
    where: { type_value: { type: 'email', value: 'admin@example.com' } },
    update: { userId: adminUser.id },
    create: {
      userId: adminUser.id,
      type: 'email',
      value: 'admin@example.com',
      verified: true,
      primary: true,
    },
  });
  log('Created admin user with email: admin@example.com');

  // Create scenarios
  let firstScenarioId: number | null = null;
  for (const scenario of SCENARIOS) {
    const created = await prisma.scenario.upsert({
      where: { slug: scenario.slug },
      update: {},
      create: scenario,
    });
    if (firstScenarioId === null) firstScenarioId = created.id;
    log(`Created scenario: ${scenario.name}`);
  }

  // Create a test invitation
  if (firstScenarioId !== null) {
    await prisma.invitation.upsert({
      where: { token: 'test-invitation-token' },
      update: {},
      create: {
        token: 'test-invitation-token',
        label: 'Dev test invitation',
        scenarioId: firstScenarioId,
        quota: { tokens: 25000, label: 'Short conversation' },
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        createdById: adminUser.id,
      },
    });
    log('Created test invitation with token: test-invitation-token');
  }
}

/**
 * Checks if the database needs seeding (no scenarios or quota presets).
 */
export async function isDatabaseEmpty(prisma: PrismaClient): Promise<boolean> {
  const [scenarioCount, presetCount] = await Promise.all([
    prisma.scenario.count(),
    prisma.quotaPreset.count(),
  ]);
  return scenarioCount === 0 || presetCount === 0;
}

/**
 * Seeds the database only if it's empty. Returns true if seeding was performed.
 */
export async function seedIfEmpty(
  prisma: PrismaClient,
  options: SeedOptions = {}
): Promise<boolean> {
  if (await isDatabaseEmpty(prisma)) {
    await seedDatabase(prisma, options);
    return true;
  }
  return false;
}
