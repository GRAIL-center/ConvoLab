import { randomBytes } from 'node:crypto';
import { createPrismaClient, Role } from '../index.js';

const prisma = createPrismaClient({ log: ['error', 'warn'] });

function _generateToken(): string {
  return randomBytes(32).toString('base64url');
}

// Fixed ID for test admin so we can upsert
const TEST_ADMIN_ID = 'test-admin-user';

async function main() {
  console.log('Seeding database...');

  // Create quota presets
  const presets = [
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

  for (const preset of presets) {
    await prisma.quotaPreset.upsert({
      where: { name: preset.name },
      update: preset,
      create: preset,
    });
  }
  console.log('Created quota presets:', presets.map((p) => p.name).join(', '));

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
  console.log('Created admin user with email: admin@example.com');

  // Create sample scenarios
  const scenario1 = await prisma.scenario.upsert({
    where: { slug: 'angry-uncle-thanksgiving' },
    update: {},
    create: {
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
  });
  console.log('Created scenario:', scenario1.name);

  const scenario2 = await prisma.scenario.upsert({
    where: { slug: 'difficult-coworker' },
    update: {},
    create: {
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
  });
  console.log('Created scenario:', scenario2.name);

  // Create a test invitation
  const testInvitation = await prisma.invitation.upsert({
    where: { token: 'test-invitation-token' },
    update: {},
    create: {
      token: 'test-invitation-token',
      label: 'Dev test invitation',
      scenarioId: scenario1.id,
      quota: { tokens: 25000, label: 'Short conversation' },
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      createdById: adminUser.id,
    },
  });
  console.log('Created test invitation with token:', testInvitation.token);

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
