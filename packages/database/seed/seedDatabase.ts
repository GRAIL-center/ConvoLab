import {
  computeContentHash,
  currentSeedVersion,
  diffSeededFields,
  type FieldDiff,
  QUOTA_PRESET_HASH_FIELDS,
  SCENARIO_HASH_FIELDS,
} from './referenceHash.js';
import type { PrismaClient } from '@workspace/database';
import {
  FEMALE_MAGA_PROMPT,
  FEMALE_PROGRESSIVE_PROMPT,
  MALE_MAGA_PROMPT,
  MALE_PROGRESSIVE_PROMPT,
} from './prompts/personaPrompts.js';

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
2. Only if specific wording in their response is likely to provoke a negative reaction (a put-down, a loaded label, an opinion stated as fact, a question that assumes the answer), name that wording plainly — e.g., "calling it 'propaganda' may trigger defensiveness because it dismisses his view." A direct question or a move to a new topic is not a risk by itself. If nothing in the wording is a problem, stop after step 1.
3. If you named a risk, suggest a better move: "Try asking a curious question first to lower resistance — e.g., '[a specific question drawn from what the uncle actually said].'" Build only on what the uncle has actually said; never attribute to him a concern he has not voiced.

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
2. Only if specific wording in their response is likely to provoke a negative reaction (a put-down, a loaded label, an opinion stated as fact, a question that assumes the answer), name that wording plainly — e.g., "calling it 'propaganda' may trigger defensiveness because it dismisses their view." A direct question or a move to a new topic is not a risk by itself. If nothing in the wording is a problem, stop after step 1.
3. If you named a risk, suggest a better move: "Try asking a curious question first to lower resistance — e.g., '[a specific question drawn from what the partner actually said].'" Build only on what the partner has actually said; never attribute to them a concern they have not voiced.

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

type PersonaName = { first: string; last: string };

/**
 * Re-key a persona prompt to a different name. The supplied prompts carry the
 * persona's name in the body text (about 130 mentions each), so the public-app
 * copies cannot just display a different label; the text itself is rewritten.
 * Case-sensitive, whole-word: "quotation marks" and "Mark's" are handled
 * correctly. Throws if the old surname survives anywhere, so a prompt that
 * mentions the name in an unexpected form fails at seed time, not silently.
 */
export function renamePersona(prompt: string, from: PersonaName, to: PersonaName): string {
  const fullName = new RegExp(`\\b${from.first} ${from.last}\\b`, 'g');
  const firstName = new RegExp(`\\b${from.first}\\b`, 'g');
  const renamed = prompt.replace(fullName, `${to.first} ${to.last}`).replace(firstName, to.first);
  if (new RegExp(`\\b${from.last}\\b`).test(renamed)) {
    throw new Error(
      `renamePersona: "${from.last}" still present after renaming to ${to.first} ${to.last}`
    );
  }
  return renamed;
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
  // Walk-up guests on the public landing page (practice.start). Sized from a
  // 5 Oct 2026 guest session: ~16,300 tokens per partner turn now that the
  // web-search tool (~6,000 tokens of its own instructions) is offered on every
  // turn (#179). 25,000 (Quick chat, the previous guest preset) ran out after
  // two exchanges; 200,000 is ~12, more than a 12-minute conversation uses.
  {
    name: 'public-practice',
    label: 'Public practice',
    description: 'Guest conversations started from the public landing page',
    quota: { tokens: 200000 },
    sortOrder: 3,
  },
];

// The four study personas exist on two surfaces with different naming rules.
//
// Pilot (study flow, resolved by slug in study.ts): both ideology conditions
// share ONE name per gender, Mark Johnson / Megan Johnson, so the partner's name
// carries the gender manipulation and none of the ideology manipulation
// (decided 5 Sep 2026, commit 4d6f10e).
//
// Public app (scenario picker): four distinct names, each chosen to sit with
// the persona's politics in FEC-donor and voter-file name data while staying
// racially unmarked (common 1980s/1990s first names, surnames spread across
// racial groups in Census data). Decided by Hanna 15 Sep 2026. The public
// copies are generated from the pilot prompt text at seed time, so persona
// revisions land on both surfaces without a second transcription.
const PILOT_NAME: Record<'man' | 'woman', PersonaName> = {
  man: { first: 'Mark', last: 'Johnson' },
  woman: { first: 'Megan', last: 'Johnson' },
};

// Card copy for the public picker only. Nothing in the pilot or study renders a
// scenario description: those surfaces carry their own partner summaries in
// trpc/routers/study.ts and pages/PilotLanding.tsx, so edits here stay public-side.
const PROGRESSIVE_DESCRIPTION =
  'A leftist who argues from systemic and structural reasoning.';
const POPULIST_DESCRIPTION =
  'A MAGA supporter who argues from fairness, accountability, and distrust of elites.';

const STUDY_PERSONAS = [
  {
    pilotSlug: 'progressive-left-male',
    generalSlug: 'general-progressive-male',
    gender: 'man',
    prompt: MALE_PROGRESSIVE_PROMPT,
    description: PROGRESSIVE_DESCRIPTION,
    generalName: { first: 'Joshua', last: 'Moore' },
  },
  {
    pilotSlug: 'progressive-left-female',
    generalSlug: 'general-progressive-female',
    gender: 'woman',
    prompt: FEMALE_PROGRESSIVE_PROMPT,
    description: PROGRESSIVE_DESCRIPTION,
    generalName: { first: 'Emily', last: 'Davis' },
  },
  {
    pilotSlug: 'populist-right-male',
    generalSlug: 'general-populist-male',
    gender: 'man',
    prompt: MALE_MAGA_PROMPT,
    description: POPULIST_DESCRIPTION,
    generalName: { first: 'Ryan', last: 'Taylor' },
  },
  {
    pilotSlug: 'populist-right-female',
    generalSlug: 'general-populist-female',
    gender: 'woman',
    prompt: FEMALE_MAGA_PROMPT,
    description: POPULIST_DESCRIPTION,
    generalName: { first: 'Ashley', last: 'Brown' },
  },
] as const satisfies ReadonlyArray<{
  pilotSlug: string;
  generalSlug: string;
  gender: 'man' | 'woman';
  prompt: string;
  description: string;
  generalName: PersonaName;
}>;

const PILOT_SCENARIOS = STUDY_PERSONAS.map((persona) => {
  const { first, last } = PILOT_NAME[persona.gender];
  const name = `${first} ${last}`;
  return {
    ...DEFAULT_DEBATE_SCENARIO_CONFIG,
    name,
    slug: persona.pilotSlug,
    description: persona.description,
    partnerPersona: name,
    partnerSystemPrompt: withSelfReference(persona.prompt, persona.gender),
    coachSystemPrompt: GENERIC_DEBATE_COACH_PROMPT,
    audience: 'pilot',
  };
});

const GENERAL_SCENARIOS = STUDY_PERSONAS.map((persona) => {
  const name = `${persona.generalName.first} ${persona.generalName.last}`;
  return {
    ...DEFAULT_DEBATE_SCENARIO_CONFIG,
    name,
    slug: persona.generalSlug,
    description: persona.description,
    partnerPersona: name,
    partnerSystemPrompt: withSelfReference(
      renamePersona(persona.prompt, PILOT_NAME[persona.gender], persona.generalName),
      persona.gender
    ),
    coachSystemPrompt: GENERIC_DEBATE_COACH_PROMPT,
    audience: 'general',
  };
});

const SCENARIOS = [
  {
    ...DEFAULT_DEBATE_SCENARIO_CONFIG,
    name: 'Angry Uncle at Thanksgiving',
    slug: 'angry-uncle-thanksgiving',
    audience: 'general',
    description:
      'Practice navigating political disagreements with a family member during a holiday dinner.',
    partnerPersona: 'Your uncle who has strong political opinions',
    partnerSystemPrompt: `You are playing the role of an uncle at a Thanksgiving dinner who has strong, contentious political views. You're not trying to be mean, but you're passionate and can get worked up. You make sweeping statements and sometimes interrupt. However, you do care about your family and can be reasoned with if approached thoughtfully.

Keep your responses conversational - 2-4 sentences typically, like a real back-and-forth dialogue. Leave room for the other person to respond. Don't monologue.

Start the conversation with a provocative political statement about current events.`,
    coachSystemPrompt: ANGRY_UNCLE_COACH_PROMPT,
  },
  ...PILOT_SCENARIOS,
  ...GENERAL_SCENARIOS,
  {
    name: 'Difficult Coworker Feedback',
    slug: 'difficult-coworker',
    audience: 'general',
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

export type ReferenceSeedEvent = Record<string, unknown> & { event: string };

export interface SeedOptions {
  log?: (message: string) => void;
  /**
   * Structured events from reference seeding (`reference_seed_created`,
   * `reference_seed_upserted`, `reference_seed_unchanged`,
   * `reference_seed_reconciled`). Defaults to `log(JSON.stringify(event))`.
   */
  logEvent?: (event: ReferenceSeedEvent) => void;
  /** Overrides the commit stamped as `seedVersion` (defaults to env GIT_SHA / _TAG). */
  seedVersion?: string;
}

export interface ReconcileOptions extends SeedOptions {
  /**
   * Compute everything, write nothing. The returned `report` says what a real
   * run would do; only a `reference_seed_dry_run` summary event is emitted.
   */
  dryRun?: boolean;
}

type SeedDoc = Record<string, unknown> & { contentHash: string };

/**
 * The exact documents reference seeding writes, each stamped with its
 * `contentHash` plus `seedVersion` / `seededAt`. Both `seedReferenceData`
 * (unconditional) and `reconcileReferenceData` (hash-compared) build from
 * this, so the two write paths cannot drift in content.
 */
function buildReferenceDocs(options: SeedOptions) {
  const seedVersion = options.seedVersion ?? currentSeedVersion();
  const seededAt = new Date();
  const stamp = (content: Record<string, unknown>, fields: readonly string[]): SeedDoc => ({
    ...content,
    contentHash: computeContentHash(content, fields),
    seedVersion,
    seededAt,
  });
  return {
    seedVersion,
    quotaPresets: QUOTA_PRESETS.map((preset) => ({
      name: preset.name,
      data: stamp(preset, QUOTA_PRESET_HASH_FIELDS),
    })),
    scenarios: SCENARIOS.map((scenario) => ({
      slug: scenario.slug,
      data: stamp({ ...scenario, isActive: true }, SCENARIO_HASH_FIELDS),
    })),
  };
}

function eventLogger(options: SeedOptions) {
  if (options.logEvent) return options.logEvent;
  const log = options.log ?? console.log;
  return (event: ReferenceSeedEvent) => log(JSON.stringify(event));
}

/**
 * Seeds reference data needed in ALL environments (including production).
 * Includes quota presets and scenarios.
 * Unconditional: every document is rewritten (merged) whether or not it
 * changed. Startup and `seed:reference` use `reconcileReferenceData` instead,
 * which skips unchanged documents; this remains for the full dev `seed`.
 * Safe to call multiple times - uses upserts.
 */
export async function seedReferenceData(prisma: PrismaClient, options: SeedOptions = {}) {
  const log = options.log ?? console.log;
  const docs = buildReferenceDocs(options);

  // Create quota presets
  for (const preset of docs.quotaPresets) {
    await prisma.quotaPreset.upsert({
      where: { name: preset.name },
      update: preset.data,
      create: preset.data,
    });
  }
  log(`Seeded quota presets: ${QUOTA_PRESETS.map((p) => p.name).join(', ')}`);

  // Create scenarios
  for (const scenario of docs.scenarios) {
    await prisma.scenario.upsert({
      where: { slug: scenario.slug },
      update: scenario.data,
      create: scenario.data,
    });
  }
  log(`Seeded scenarios: ${SCENARIOS.map((s) => s.slug).join(', ')}`);
}

export type ReconcileAction = 'create' | 'update' | 'unchanged';

export interface ReconcileReportEntry {
  kind: 'scenario' | 'quotaPreset';
  /** Scenario slug or quota preset name. */
  key: string;
  action: ReconcileAction;
  fromHash: string | null;
  toHash: string;
  /**
   * For `update`: the hashed fields whose values differ. Empty when only the
   * stored hash is missing or stale (the content already matches).
   */
  fields: FieldDiff[];
}

export interface ReferenceReconcileSummary {
  seedVersion: string;
  dryRun: boolean;
  scenarios: { created: string[]; upserted: string[]; unchanged: string[] };
  quotaPresets: { created: string[]; upserted: string[]; unchanged: string[] };
  report: ReconcileReportEntry[];
}

/**
 * Brings the stored reference data (quota presets, scenarios) in line with
 * the repo, writing only what changed. Runs at every API startup and from
 * `seed:reference`.
 *
 * For each seeded document, keyed by slug (scenarios) or name (presets):
 * - missing: created;
 * - stored `contentHash` differs (or is absent, e.g. seeded before hashes
 *   existed): updated, logged as `reference_seed_upserted` with from/to hashes
 *   and the names of the differing fields;
 * - equal: skipped.
 *
 * Updates MERGE into the stored document: fields the seed does not write
 * (ids, anything added by hand) survive. Nothing is ever deleted, and no
 * collection other than `scenarios` and `quotaPresets` is read or written, so
 * sessions, users and invitations are untouched. Idempotent: a second run
 * with the same code writes nothing and logs `reference_seed_unchanged`.
 *
 * `dryRun: true` performs only the reads and returns the same report.
 */
export async function reconcileReferenceData(
  prisma: PrismaClient,
  options: ReconcileOptions = {}
): Promise<ReferenceReconcileSummary> {
  const emit = eventLogger(options);
  const dryRun = options.dryRun === true;
  const docs = buildReferenceDocs(options);
  const summary: ReferenceReconcileSummary = {
    seedVersion: docs.seedVersion,
    dryRun,
    scenarios: { created: [], upserted: [], unchanged: [] },
    quotaPresets: { created: [], upserted: [], unchanged: [] },
    report: [],
  };

  const targets = [
    ...docs.quotaPresets.map(({ name, data }) => ({
      kind: 'quotaPreset' as const,
      keyField: 'name' as const,
      key: name,
      data,
      fields: QUOTA_PRESET_HASH_FIELDS as readonly string[],
      model: prisma.quotaPreset,
      bucket: summary.quotaPresets,
    })),
    ...docs.scenarios.map(({ slug, data }) => ({
      kind: 'scenario' as const,
      keyField: 'slug' as const,
      key: slug,
      data,
      fields: SCENARIO_HASH_FIELDS as readonly string[],
      model: prisma.scenario,
      bucket: summary.scenarios,
    })),
  ];

  for (const { kind, keyField, key, data, fields, model, bucket } of targets) {
    const where = { [keyField]: key };
    const stored = await model.findUnique({ where });
    const toHash = data.contentHash;

    if (!stored) {
      summary.report.push({ kind, key, action: 'create', fromHash: null, toHash, fields: [] });
      bucket.created.push(key);
      if (!dryRun) {
        await model.upsert({ where, update: data, create: data });
        emit({ event: 'reference_seed_created', kind, [keyField]: key, to: toHash });
      }
      continue;
    }

    const fromHash = typeof stored.contentHash === 'string' ? stored.contentHash : null;
    if (fromHash === toHash) {
      summary.report.push({ kind, key, action: 'unchanged', fromHash, toHash, fields: [] });
      bucket.unchanged.push(key);
      continue;
    }

    const diff = diffSeededFields(stored, data, fields);
    summary.report.push({ kind, key, action: 'update', fromHash, toHash, fields: diff });
    bucket.upserted.push(key);
    if (!dryRun) {
      await model.update({ where: { id: stored.id }, data });
      emit({
        event: 'reference_seed_upserted',
        kind,
        [keyField]: key,
        from: fromHash,
        to: toHash,
        fields: diff.map((d) => d.field),
      });
    }
  }

  const count = (key: 'created' | 'upserted' | 'unchanged') =>
    summary.scenarios[key].length + summary.quotaPresets[key].length;
  if (dryRun) {
    emit({
      event: 'reference_seed_dry_run',
      wouldCreate: count('created'),
      wouldUpdate: count('upserted'),
      unchanged: count('unchanged'),
      seedVersion: summary.seedVersion,
    });
  } else if (count('created') + count('upserted') === 0) {
    emit({
      event: 'reference_seed_unchanged',
      scenarios: summary.scenarios.unchanged.length,
      quotaPresets: summary.quotaPresets.unchanged.length,
      seedVersion: summary.seedVersion,
    });
  } else {
    emit({
      event: 'reference_seed_reconciled',
      created: count('created'),
      upserted: count('upserted'),
      unchanged: count('unchanged'),
      seedVersion: summary.seedVersion,
    });
  }
  return summary;
}

/**
 * Plain-text table of a reconcile report, for the `seed:reference` CLI. Field
 * names, lengths and hashes only; never any prompt text.
 */
export function formatReconcileReport(summary: ReferenceReconcileSummary): string {
  const short = (hash: string | null | undefined) => (hash ? hash.slice(0, 12) : '-');
  const describe = (d: FieldDiff) => {
    const lengths =
      d.old !== undefined || d.new !== undefined
        ? ` len ${d.old?.length ?? '-'}->${d.new?.length ?? '-'}, sha ${short(d.old?.sha256)}->${short(d.new?.sha256)}`
        : '';
    return `${d.field} (${d.effect}${lengths})`;
  };
  const rows = summary.report.map((entry) => [
    entry.kind,
    entry.key,
    entry.action,
    entry.action === 'update'
      ? entry.fields.length > 0
        ? entry.fields.map(describe).join('; ')
        : '(content matches; stored hash missing or stale, hash fields only)'
      : '',
  ]);
  const header = ['kind', 'key', 'action', 'differing fields'];
  const widths = header
    .slice(0, 3)
    .map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) =>
    cells
      .map((cell, i) => (i < 3 ? cell.padEnd(widths[i]) : cell))
      .join('  ')
      .trimEnd();
  const created = summary.scenarios.created.length + summary.quotaPresets.created.length;
  const updated = summary.scenarios.upserted.length + summary.quotaPresets.upserted.length;
  const unchanged = summary.scenarios.unchanged.length + summary.quotaPresets.unchanged.length;
  return [
    line(header),
    line(widths.map((w) => '-'.repeat(w)).concat('----------------')),
    ...rows.map(line),
    '',
    `${summary.dryRun ? 'DRY RUN, nothing written. Would create' : 'Created'} ${created}, ` +
      `${summary.dryRun ? 'would update' : 'updated'} ${updated}, unchanged ${unchanged} ` +
      `(seedVersion ${summary.seedVersion}).`,
  ].join('\n');
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
