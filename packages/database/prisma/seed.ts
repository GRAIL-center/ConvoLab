import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create test user
  const passwordHash = await bcrypt.hash('password123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      username: 'testuser',
      passwordHash,
      isStaff: true,
    },
  });
  console.log('Created test user:', user.email);

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
