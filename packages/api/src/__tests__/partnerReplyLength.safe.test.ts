/**
 * Prompt-level half of the partner register check: the study partner must
 * answer in 1 to 3 sentences, 4 at most. (The output-level half is
 * scripts/audit_reply_length.py, which measures real replies.)
 *
 * The rule is not in the persona prompts. It is PARTNER_RESPONSE_POLICY, which
 * ws/conversation.ts appends at runtime to every partner system prompt via
 * buildPartnerSystemPrompt. So these tests live in packages/api and rebuild the
 * final prompt the way the app does:
 *   study:   seeded persona -> buildStudyPrompt (study.ts) -> buildPartnerSystemPrompt
 *   general: seeded persona -> buildPartnerSystemPrompt
 */
import type { PrismaClient } from '@workspace/database';
import { describe, expect, it, vi } from 'vitest';
import { seedReferenceData } from '../../../database/seed/seedDatabase.js';
// Detector shared with the persona .txt checks in packages/database.
import { competingLengthRules } from '../../../database/src/__tests__/competingLengthRules.js';
import {
  buildFactContext,
  electionLine,
  usElectionDay,
  buildPartnerSystemPrompt,
  PARTNER_RESPONSE_POLICY,
} from '../lib/partnerRuntimePrompt.js';
import { buildStudyPrompt } from '../trpc/routers/study.js';

const STUDY_SLUGS = [
  'progressive-left-male',
  'progressive-left-female',
  'populist-right-male',
  'populist-right-female',
] as const;

const GENERAL_SLUGS = [
  'general-progressive-male',
  'general-progressive-female',
  'general-populist-male',
  'general-populist-female',
] as const;

// Study-session variants the router can produce: assigned topic vs own topic,
// participant-first vs partner-opens.
const STUDY_VARIANTS = [
  { topic: 'Immigration', ownTopic: undefined, partnerOpens: false },
  { topic: 'Guns', ownTopic: undefined, partnerOpens: true },
  { topic: 'Pick your own topic', ownTopic: 'Trump', partnerOpens: false },
] as const;

async function seededPartnerPrompts(): Promise<Map<string, string>> {
  const scenarioUpsert = vi.fn().mockResolvedValue({});
  const client = {
    quotaPreset: { upsert: vi.fn().mockResolvedValue({}) },
    scenario: { upsert: scenarioUpsert },
  } as unknown as PrismaClient;
  await seedReferenceData(client, { log: () => {} });
  const prompts = new Map<string, string>();
  for (const [args] of scenarioUpsert.mock.calls) {
    prompts.set(args.where.slug, args.update.partnerSystemPrompt);
  }
  return prompts;
}

const seeded = await seededPartnerPrompts();

// Fixed so the appended block cannot differ between calls across midnight.
const NOW = new Date('2026-09-25T15:00:00Z');

function seededPrompt(slug: string): string {
  const prompt = seeded.get(slug);
  if (!prompt) throw new Error(`seed did not upsert ${slug}`);
  return prompt;
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('competing length rules (test 1)', () => {
  it('the detector catches the forms it is meant to catch', () => {
    for (const bad of [
      'Keep replies to 3-6 sentences.',
      'Answer in 4 to 6 sentences.',
      'Use 2–3 sentences.',
      'Write three to five sentences.',
      'Respond in two short paragraphs.',
      'Keep it to a single paragraph.',
      'No more than 2 paragraphs.',
    ]) {
      expect(competingLengthRules('fixture', bad), bad).toHaveLength(1);
    }
    for (const ok of [
      'Her sentences are usually straightforward.',
      'Politics is not every sentence Mark speaks.',
      'Keep your first reply SHORT, one or two sentences.',
    ]) {
      expect(competingLengthRules('fixture', ok), ok).toEqual([]);
    }
  });

  it.each([...STUDY_SLUGS, ...GENERAL_SLUGS])('the seeded %s persona has none', (slug) => {
    expect(competingLengthRules(slug, seededPrompt(slug))).toEqual([]);
  });

  it.each(STUDY_SLUGS)('the study prompt built from %s has none', (slug) => {
    for (const v of STUDY_VARIANTS) {
      const study = buildStudyPrompt(seededPrompt(slug), v.topic, v.ownTopic, v.partnerOpens);
      expect(competingLengthRules(`${slug}+study(${v.topic})`, study)).toEqual([]);
    }
  });
});

const NEW_LENGTH_LINES = [
  '- Keep sentences short, usually under 15 words. Talk the way people talk, not the way essays read.',
  '- Most replies should be under 40 words in total. Never go past 60.',
];

describe('response-length policy in the final partner prompt (test 2)', () => {
  it('says 1 to 3 sentences with a maximum of 4, short sentences, under 40 words', () => {
    expect(PARTNER_RESPONSE_POLICY).toMatch(/^RESPONSE LENGTH:\n/);
    expect(PARTNER_RESPONSE_POLICY).toContain(
      '- Most replies should be 1-3 sentences. A single line is often the strongest answer.\n' +
        '- Keep sentences short, usually under 15 words. Talk the way people talk, not the way essays read.\n' +
        '- Most replies should be under 40 words in total. Never go past 60.\n'
    );
    expect(PARTNER_RESPONSE_POLICY).toContain(
      '- Use 4 sentences only when you are directly challenged, correcting a misreading, or the point genuinely needs it. Do not go past 4.'
    );
    expect(PARTNER_RESPONSE_POLICY).toContain(
      'This supersedes any length guidance earlier in your instructions'
    );
  });

  it.each(STUDY_SLUGS)('appears exactly once, last, in every %s study prompt', (slug) => {
    for (const v of STUDY_VARIANTS) {
      const final = buildPartnerSystemPrompt(
        buildStudyPrompt(seededPrompt(slug), v.topic, v.ownTopic, v.partnerOpens),
        NOW
      );
      expect(countOccurrences(final, PARTNER_RESPONSE_POLICY)).toBe(1);
      expect(countOccurrences(final, 'RESPONSE LENGTH:')).toBe(1);
      for (const line of NEW_LENGTH_LINES) expect(countOccurrences(final, line)).toBe(1);
      expect(final.endsWith(PARTNER_RESPONSE_POLICY)).toBe(true);
    }
  });

  it.each(GENERAL_SLUGS)('appears exactly once, last, in the %s prompt', (slug) => {
    const final = buildPartnerSystemPrompt(seededPrompt(slug), NOW);
    expect(countOccurrences(final, PARTNER_RESPONSE_POLICY)).toBe(1);
    expect(countOccurrences(final, 'RESPONSE LENGTH:')).toBe(1);
    for (const line of NEW_LENGTH_LINES) expect(countOccurrences(final, line)).toBe(1);
    expect(final.endsWith(PARTNER_RESPONSE_POLICY)).toBe(true);
  });
});

describe('policy is identical across ideology and gender (test 3)', () => {
  function appendedBlock(base: string): string {
    const final = buildPartnerSystemPrompt(base, NOW);
    expect(final.startsWith(base)).toBe(true);
    return final.slice(base.length);
  }

  it('the appended block is byte-identical for the four study personas', () => {
    for (const v of STUDY_VARIANTS) {
      const blocks = STUDY_SLUGS.map((slug) =>
        appendedBlock(buildStudyPrompt(seededPrompt(slug), v.topic, v.ownTopic, v.partnerOpens))
      );
      expect(new Set(blocks).size).toBe(1);
      expect(blocks[0]).toContain(PARTNER_RESPONSE_POLICY);
    }
  });

  it('and matches the block the four general-app copies get', () => {
    const study = appendedBlock(buildStudyPrompt(seededPrompt(STUDY_SLUGS[0]), 'Taxes'));
    for (const slug of GENERAL_SLUGS) {
      expect(appendedBlock(seededPrompt(slug))).toBe(study);
    }
  });

  it('the study block buildStudyPrompt adds is identical across the four personas', () => {
    for (const v of STUDY_VARIANTS) {
      const added = STUDY_SLUGS.map((slug) => {
        const base = seededPrompt(slug).trim();
        const study = buildStudyPrompt(base, v.topic, v.ownTopic, v.partnerOpens);
        expect(study.startsWith(base)).toBe(true);
        return study.slice(base.length);
      });
      expect(new Set(added).size).toBe(1);
    }
  });
});

describe('runtime fact context date', () => {
  const PRESIDENT_LINE =
    '- The current U.S. president is Donald J. Trump, sworn in on January 20, 2025.';

  it('carries the injected date in en-US long form', () => {
    expect(buildFactContext(NOW)).toContain('\n- Today is September 25, 2026.\n');
    expect(buildFactContext(new Date('2027-01-03T12:00:00Z'))).toContain(
      '\n- Today is January 3, 2027.\n'
    );
    expect(buildFactContext(NOW)).not.toContain('August 6, 2026');
    // The partner must verify events it VOLUNTEERS, not only ones it is asked
    // about: on 15 Oct it opened a conversation by asserting a year-old
    // National Guard situation as current (greeting turn, no search).
    expect(buildFactContext(NOW)).toContain('events you bring up yourself');
  });

  it('uses the US Eastern day, not UTC (3 Nov 2026)', () => {
    // 8 pm Eastern on Sep 25 is already Sep 26 in UTC: the old UTC date told
    // the model it was tomorrow every US evening.
    expect(buildFactContext(new Date('2026-09-26T00:00:00Z'))).toContain(
      '- Today is September 25, 2026.'
    );
    expect(buildFactContext(new Date('2026-09-26T04:00:00Z'))).toContain(
      '- Today is September 26, 2026.'
    );
    // Standard time (EST, UTC-5) after daylight saving ends.
    expect(buildFactContext(new Date('2026-11-04T04:30:00Z'))).toContain(
      '- Today is November 3, 2026.'
    );
  });

  it('leaves the other lines unchanged', () => {
    expect(buildFactContext(NOW)).toBe(`
Runtime factual context:
- Today is September 25, 2026.
${PRESIDENT_LINE}
- For current-events or "right now" factual questions, including elections, voting and anything happening today, use web search/grounding when available and let current evidence override stale model memory.
- Search results often include older articles. Check each result's date against today's date, and only describe something as happening now if the coverage is from the last few weeks. If the newest coverage you find is older, talk about it in the past tense or say you haven't followed it lately.
- Hard rule, and it applies to events you bring up yourself, not only to questions you are asked: never present a specific event, case, deployment, or court fight as happening right now unless you ran a web search in this very reply and the coverage is current. No search in this reply means no named current events: open from a general issue you care about (prices, the border, crime, schools) or something timeless about politics instead.
- Do not claim Joe Biden is the current U.S. president unless current search evidence explicitly says that.
`);
  });

  it('the full partner prompt carries the injected date and still ends with the policy', () => {
    const final = buildPartnerSystemPrompt(
      buildStudyPrompt(seededPrompt(STUDY_SLUGS[0]), 'Healthcare'),
      new Date('2026-10-14T09:00:00Z')
    );
    expect(final).toContain('- Today is October 14, 2026.');
    expect(countOccurrences(final, PRESIDENT_LINE)).toBe(1);
    expect(final.endsWith(PARTNER_RESPONSE_POLICY)).toBe(true);
    expect(countOccurrences(final, PARTNER_RESPONSE_POLICY)).toBe(1);
  });
});

describe('US election day line', () => {
  it('finds the Tuesday after the first Monday in November, even years only', () => {
    expect(usElectionDay(2026)).toBe('2026-11-03');
    expect(usElectionDay(2028)).toBe('2028-11-07');
    expect(usElectionDay(2022)).toBe('2022-11-08'); // Nov 1 was a Tuesday
    expect(usElectionDay(2032)).toBe('2032-11-02'); // Nov 1 is a Monday
    expect(usElectionDay(2027)).toBeNull();
  });

  it('says it is Election Day on the day, in Eastern time', () => {
    // 9:39 pm UTC on Nov 3: the conversation that prompted this fix.
    const context = buildFactContext(new Date('2026-11-03T21:39:00Z'));
    expect(context).toContain('- Today is November 3, 2026.');
    expect(context).toContain('Today is Election Day for the 2026 U.S. midterm elections');
    expect(context).toContain('Do not say Election Day is tomorrow');
    // Still Election Day at 11 pm Eastern (04:00 UTC the next day).
    expect(buildFactContext(new Date('2026-11-04T04:00:00Z'))).toContain('Today is Election Day');
  });

  it('counts down before and back after, within two weeks', () => {
    expect(electionLine('2026-11-02')).toContain('is tomorrow (Tuesday, November 3)');
    expect(electionLine('2026-10-30')).toContain('is in 4 days');
    expect(electionLine('2026-11-04')).toContain('was yesterday');
    expect(electionLine('2026-11-10')).toContain('was 7 days ago');
    expect(electionLine('2026-11-10')).toContain('Do not state results from memory');
    expect(electionLine('2026-10-20')).toContain('is in 14 days');
    expect(electionLine('2026-10-19')).toBeNull();
    expect(electionLine('2026-11-18')).toBeNull();
    expect(electionLine('2027-11-02')).toBeNull();
    expect(electionLine('2028-11-07')).toContain('the 2028 U.S. presidential election');
  });

  it('adds nothing outside the window', () => {
    const context = buildFactContext(new Date('2026-09-25T12:00:00Z'));
    expect(context).not.toContain('Election Day');
    expect(context).toContain('including elections, voting and anything happening today');
  });
});
