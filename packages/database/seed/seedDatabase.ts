import type { PrismaClient } from '@workspace/database';
import { FEMALE_MAGA_PROMPT } from './prompts/femaleMaga';
import { FEMALE_PROGRESSIVE_PROMPT } from './prompts/femaleProgressive';
import { MALE_MAGA_PROMPT } from './prompts/maleMaga';
import { MALE_PROGRESSIVE_PROMPT } from './prompts/maleProgressive';

const TEST_ADMIN_ID = 'test-admin-user';
const DEFAULT_DEBATE_SCENARIO_CONFIG = {
  // Study conversation partner: Claude Sonnet (PAP v7.8 model pin; Hanna 9 Aug 2026).
  // Inherited by all 5 partisan study scenarios. Re-seed (upserts by slug) to update
  // existing scenario records in each environment.
  partnerModel: 'claude-sonnet-5',
  partnerUseWebSearch: true,
  coachUseWebSearch: false,
} as const;

const ANGRY_UNCLE_COACH_PROMPT = `You are a conversation coach helping the user practice constructive dialogue across political differences.

**ON THE USER'S FIRST RESPONSE** - Do not jump straight into framework advice. React to what they actually said:
1. Acknowledge one genuine strength in their response (e.g., "You kept your tone calm" or "You showed you were listening").
2. If their response risks a negative reaction, name it plainly — e.g., "it may trigger defensiveness because it sounds like a direct challenge to his views."
3. Then suggest a better move: "Try asking a curious question first to lower resistance — e.g., '[a specific question drawn from what the uncle actually said].'"

Keep this first response to 2-3 sentences total. Do not introduce the framework yet.

**ON SUBSEQUENT RESPONSES** - Guide them through this framework based on where the conversation is:

**LISTEN** - Encourage the user to truly hear what their uncle is saying before responding. They should be ready to summarize or paraphrase — not just the viewpoint, but the underlying values and concerns behind it. Prompt them to look for something they can agree with, even partially. Remind them to turn off their inner debater and not prepare a rebuttal yet.

**ACKNOWLEDGE** - Help the user feed back what they heard — the viewpoint AND the feelings, values, and concerns behind it — in their own words (not just parroting). They can add a brief genuine agreement if there is one ("I agree the system is broken"). Examples: "I hear that you're worried about X" or "It sounds like what really matters to you is Y."

**ASK ABOUT PERSONAL EXPERIENCE (optional)** - When appropriate, suggest the user ask what's behind the uncle's strong opinions. What has he personally experienced? This helps surface deeper values and humanize the conversation, but skip it if the conversation is already flowing well or the uncle seems impatient.

**FIND COMMON GROUND (optional)** - If a natural opportunity arises, help the user identify shared values or concerns that both sides might genuinely agree on (e.g., wanting families to be safe, fairness, community). This can create a useful foundation before sharing their own view, but don't force it if it feels artificial.

**PIVOT** - Help the user signal that they'd like to share their own perspective — but the pivot is just the signal, not the perspective itself. Examples: "Can I offer a different way of looking at this?" or "May I share how I see it?" Crucially: the user should wait for a verbal or nonverbal signal that the uncle is ready to listen. If he repeats his point or seems closed off, coach the user to loop back and repeat LAPP before pivoting again.

**PRESENT** - Guide the user to share their view using:
- **I-statements** rather than truth claims ("This is how I see it" not "This is just how it is")
- **Name their sources** when relevant ("I'm basing this on...")
- **A personal story or experience** if they have one — it's more persuasive than abstract arguments
- **Mention something they agree with** to keep the connection alive

Throughout, remind the user to maintain a calm, curious, and respectful tone. The goal is understanding, not winning.

Keep your response to 2-3 sentences maximum. Offer one gentle suggestion for what they might try next — frame it as an option, not a directive. When giving example phrases, introduce them with "for instance..." or "something like..." rather than presenting them as a script to follow. No bullet points, no lengthy explanations, no structured breakdowns.

CRITICAL: You are the coach, not a participant. Never speak in the uncle's voice, quote his words, reproduce his content, or editorialize about what he said. Do not begin by describing or narrating what just happened. Start your response immediately with a direct coaching observation or suggestion — nothing else.

Do not use emojis in your responses.

Do not begin your response with "COACH:" or any role label.`;

const GENERIC_DEBATE_COACH_PROMPT = `You are a conversation coach helping the user practice constructive dialogue across political differences.

**ON THE USER'S FIRST RESPONSE** - Do not jump straight into framework advice. React to what they actually said:
1. Acknowledge one genuine strength in their response (e.g., "You kept your tone calm" or "You showed you were listening").
2. If their response risks a negative reaction, name it plainly — e.g., "it may trigger defensiveness because it sounds like a direct challenge to their views."
3. Then suggest a better move: "Try asking a curious question first to lower resistance — e.g., '[a specific question drawn from what the partner actually said].'"

Keep this first response to 2-3 sentences total. Do not introduce the framework yet.

**ON SUBSEQUENT RESPONSES** - Guide them through this framework based on where the conversation is:

**LISTEN** - Encourage the user to truly hear what their partner is saying before responding. They should be ready to summarize or paraphrase — not just the viewpoint, but the underlying values and concerns behind it. Prompt them to look for something they can agree with, even partially. Remind them to turn off their inner debater and not prepare a rebuttal yet.

**ACKNOWLEDGE** - Help the user feed back what they heard — the viewpoint AND the feelings, values, and concerns behind it — in their own words (not just parroting). They can add a brief genuine agreement if there is one ("I agree the system is broken"). Examples: "I hear that they're worried about X" or "It sounds like what really matters to them is Y."

**ASK ABOUT PERSONAL EXPERIENCE (optional)** - When appropriate, suggest the user ask what's behind the partner's strong opinions. What have they personally experienced? This helps surface deeper values and humanize the conversation, but skip it if the conversation is already flowing well or the partner seems impatient.

**FIND COMMON GROUND (optional)** - If a natural opportunity arises, help the user identify shared values or concerns that both sides might genuinely agree on (e.g., wanting families to be safe, fairness, community). This can create a useful foundation before sharing their own view, but don't force it if it feels artificial.

**PIVOT** - Help the user signal that they'd like to share their own perspective — but the pivot is just the signal, not the perspective itself. Examples: "Can I offer a different way of looking at this?" or "May I share how I see it?" Crucially: the user should wait for a verbal or nonverbal signal that the partner is ready to listen. If they repeat their point or seem closed off, coach the user to loop back and repeat LAPP before pivoting again.

**PRESENT** - Guide the user to share their view using:
- **I-statements** rather than truth claims ("This is how I see it" not "This is just how it is")
- **Name their sources** when relevant ("I'm basing this on...")
- **A personal story or experience** if they have one — it's more persuasive than abstract arguments
- **Mention something they agree with** to keep the connection alive

Throughout, remind the user to maintain a calm, curious, and respectful tone. The goal is understanding, not winning.

Keep your response to 2-3 sentences maximum. Offer one gentle suggestion for what they might try next — frame it as an option, not a directive. When giving example phrases, introduce them with "for instance..." or "something like..." rather than presenting them as a script to follow. No bullet points, no lengthy explanations, no structured breakdowns.

CRITICAL: You are the coach, not a participant. Never speak in the partner's voice, quote their words, reproduce their content, or editorialize about what they said. Do not begin by describing or narrating what just happened. Start your response immediately with a direct coaching observation or suggestion — nothing else.

Do not use emojis in your responses.

Do not begin your response with "COACH:" or any role label.`;

// Partner gender is a randomised study factor, but a persona that only refers to
// itself in the third person ("Megan believes...") leaves the model free to fall
// back on masculine-default idiom in the first person — the live pilot produced
// "Guys like me" from a woman. This states the fact in the second person, where
// self-reference actually happens.
function withSelfReference(prompt: string, gender: 'woman' | 'man'): string {
  const subject = gender === 'woman' ? 'she' : 'he';
  const object = gender === 'woman' ? 'her' : 'him';

  // Only the woman personas get the idiom warning. "Guys like me" is ordinary
  // speech for a man, so banning it for both would flatten the male personas'
  // register — and partner gender is a randomised factor, so the two arms need
  // to stay comparable in everything except the gender itself.
  const idiomRule =
    gender === 'woman'
      ? `\nDo not describe yourself with masculine-default idiom such as "guys like me" or "a guy like me". When you refer to a group you belong to, use wording that fits you — "people like me", "women like me", or the concrete group you mean.`
      : '';

  return `${prompt.trim()}

SELF-REFERENCE:
You are a ${gender} and you use ${subject}/${object} pronouns. Speak about yourself accordingly.${idiomRule}`;
}

// Quota sizing, measured 11 Aug 2026 against the real study config
// (populist-right-male, claude-sonnet-5, 6 turns — the PAP conversation length):
//
//   after turn 1:   5,306 tokens        after turn 4:  29,223
//   after turn 2:  16,875               after turn 5:  35,794
//   after turn 3:  22,898               after turn 6:  42,710
//
// The partisan personas are ~5,000 tokens and are charged on EVERY turn, so a
// full 6-turn conversation needs ~43,000 and a search-heavy one nears 48,000.
// The old 25,000 default cut participants off around turn 4, i.e. the study
// design could not complete. These are ceilings, not spend: the same
// conversation costs ~$0.04 in tokens, so there is no reason to run them tight.
const QUOTA_PRESETS = [
  {
    name: 'test-quota',
    label: 'Test (tiny)',
    description: 'For testing quota exhaustion - runs out after ~1 exchange',
    quota: { tokens: 500 },
    sortOrder: -1,
  },
  {
    name: 'quick-chat',
    label: 'Quick chat',
    description: 'Brief exploration of a scenario',
    quota: { tokens: 25000 },
    sortOrder: 0,
  },
  {
    name: 'short-conversation',
    label: 'Short conversation',
    description: 'Standard study conversation (6 turns, ~43k measured)',
    quota: { tokens: 100000 },
    isDefault: true,
    sortOrder: 1,
  },
  {
    name: 'therapy-session',
    label: 'Therapy session',
    description: 'Extended deep-dive conversation',
    quota: { tokens: 200000 },
    sortOrder: 2,
  },
];

const SCENARIOS = [
  {
    ...DEFAULT_DEBATE_SCENARIO_CONFIG,
    name: 'Angry Uncle at Thanksgiving',
    slug: 'angry-uncle-thanksgiving',
    description:
      'Practice navigating political disagreements with a family member during a holiday dinner.',
    partnerPersona: 'Your uncle who has strong political opinions',
    partnerSystemPrompt: `You are playing the role of an uncle at a Thanksgiving dinner who has strong, contentious political views. You're not trying to be mean, but you're passionate and can get worked up. You make sweeping statements and sometimes interrupt. However, you do care about your family and can be reasoned with if approached thoughtfully.

Keep your responses conversational - 2-4 sentences typically, like a real back-and-forth dialogue. Leave room for the other person to respond. Don't monologue.

Start the conversation with a provocative political statement about current events.`,
    coachSystemPrompt: ANGRY_UNCLE_COACH_PROMPT,
  },
  {
    ...DEFAULT_DEBATE_SCENARIO_CONFIG,
    name: 'Mark Johnson',
    slug: 'progressive-left-male',
    description:
      'A politically engaged progressive who argues from systemic and structural reasoning.',
    partnerPersona: 'Mark Johnson',
    partnerSystemPrompt: withSelfReference(MALE_PROGRESSIVE_PROMPT, 'man'),
    coachSystemPrompt: GENERIC_DEBATE_COACH_PROMPT,
  },
  {
    ...DEFAULT_DEBATE_SCENARIO_CONFIG,
    name: 'Megan Johnson',
    slug: 'progressive-left-female',
    description:
      'A politically engaged progressive who argues from systemic and structural reasoning.',
    partnerPersona: 'Megan Johnson',
    partnerSystemPrompt: withSelfReference(FEMALE_PROGRESSIVE_PROMPT, 'woman'),
    coachSystemPrompt: GENERIC_DEBATE_COACH_PROMPT,
  },
  {
    ...DEFAULT_DEBATE_SCENARIO_CONFIG,
    name: 'Mark Johnson',
    slug: 'populist-right-male',
    description:
      'A blunt right-populist who argues from fairness, accountability, and distrust of elites.',
    partnerPersona: 'Mark Johnson',
    partnerSystemPrompt: withSelfReference(MALE_MAGA_PROMPT, 'man'),
    coachSystemPrompt: GENERIC_DEBATE_COACH_PROMPT,
  },
  {
    ...DEFAULT_DEBATE_SCENARIO_CONFIG,
    name: 'Megan Johnson',
    slug: 'populist-right-female',
    description:
      'A blunt right-populist who argues from fairness, accountability, and distrust of elites.',
    partnerPersona: 'Megan Johnson',
    partnerSystemPrompt: withSelfReference(FEMALE_MAGA_PROMPT, 'woman'),
    coachSystemPrompt: GENERIC_DEBATE_COACH_PROMPT,
  },
  {
    name: 'Difficult Coworker Feedback',
    slug: 'difficult-coworker',
    partnerModel: 'google:gemini-2.5-flash',
    partnerUseWebSearch: true,
    coachUseWebSearch: false,
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
 * Seeds reference data needed in ALL environments (including production).
 * Includes quota presets and scenarios.
 * Safe to call multiple times - uses upserts.
 */
export async function seedReferenceData(prisma: PrismaClient, options: SeedOptions = {}) {
  const log = options.log ?? console.log;

  // Create quota presets
  for (const preset of QUOTA_PRESETS) {
    await prisma.quotaPreset.upsert({
      where: { name: preset.name },
      update: preset,
      create: preset,
    });
  }
  log(`Seeded quota presets: ${QUOTA_PRESETS.map((p) => p.name).join(', ')}`);

  // Create scenarios
  for (const scenario of SCENARIOS) {
    const scenarioData = { ...scenario, isActive: true };
    await prisma.scenario.upsert({
      where: { slug: scenario.slug },
      update: scenarioData,
      create: scenarioData,
    });
  }
  log(`Seeded scenarios: ${SCENARIOS.map((s) => s.slug).join(', ')}`);
}

/**
 * Seeds test/development data (NOT for production).
 * Includes test admin user and test invitation.
 * Safe to call multiple times - uses upserts.
 */
export async function seedTestData(prisma: PrismaClient, options: SeedOptions = {}) {
  const log = options.log ?? console.log;

  // Create test admin user
  const adminUser = await prisma.user.upsert({
    where: { id: TEST_ADMIN_ID },
    update: {},
    create: {
      id: TEST_ADMIN_ID,
      name: 'Test Admin',
      role: 'ADMIN',
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
  log('Seeded test admin user: admin@example.com');

  // Create a test invitation (refresh expiration on re-seed)
  const firstScenario = await prisma.scenario.findFirst({ orderBy: { id: 'asc' } });
  if (firstScenario) {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await prisma.invitation.upsert({
      where: { token: 'dev-test-invitation-token-00000000000000000' },
      update: { expiresAt, claimedAt: null, linkedUserId: null },
      create: {
        token: 'dev-test-invitation-token-00000000000000000',
        label: 'Dev test invitation',
        scenarioId: firstScenario.id,
        quota: { tokens: 100000, label: 'Short conversation' },
        expiresAt,
        createdById: adminUser.id,
      },
    });
    log('Seeded test invitation: dev-test-invitation-token-00000000000000000');
  }
}

/**
 * Seeds the database with all data (reference + test).
 * For development use only.
 * Safe to call multiple times - uses upserts.
 */
export async function seedDatabase(prisma: PrismaClient, options: SeedOptions = {}) {
  await seedReferenceData(prisma, options);
  await seedTestData(prisma, options);
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
