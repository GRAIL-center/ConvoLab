import { describe, expect, it } from 'vitest';
import { TOPIC_PHRASES } from '../lib/conversationIntro.js';
import { GENERIC_OPENER, getPartnerOpener } from '../lib/partnerOpeners.js';

const IDEOLOGIES = ['left', 'right'] as const;
const TOPICS = Object.keys(TOPIC_PHRASES);

/**
 * The opener is the stimulus in the partner-opens arm: every participant on a
 * given topic and partner ideology reads exactly this text. These assertions
 * are about properties the copy must keep, not about the wording itself, which
 * is approved content and is not edited to satisfy a test.
 */
describe('getPartnerOpener', () => {
  it('covers every canonical study topic (the TOPIC_PHRASES keys)', () => {
    expect(TOPICS).toHaveLength(7);
  });

  it.each(IDEOLOGIES)('returns a distinct, non-empty opener for every topic (%s)', (ideology) => {
    const openers = TOPICS.map((topic) => getPartnerOpener(topic, ideology));
    for (const opener of openers) {
      expect(opener.trim().length).toBeGreaterThan(0);
      expect(opener).not.toBe(GENERIC_OPENER);
    }
    expect(new Set(openers).size).toBe(TOPICS.length);
  });

  it('gives the two ideologies different openers on the same topic', () => {
    for (const topic of TOPICS) {
      expect(getPartnerOpener(topic, 'left')).not.toBe(getPartnerOpener(topic, 'right'));
    }
  });

  it.each(IDEOLOGIES)('falls back to the generic opener for an own topic (%s)', (ideology) => {
    expect(getPartnerOpener('Pick your own topic', ideology)).toBe(GENERIC_OPENER);
  });

  it.each([
    '',
    'Trump',
    'the war in Gaza',
    'toString',
    'constructor',
  ])('falls back to the generic opener for an unrecognised topic: %s', (topic) => {
    expect(getPartnerOpener(topic, 'left')).toBe(GENERIC_OPENER);
    expect(getPartnerOpener(topic, 'right')).toBe(GENERIC_OPENER);
  });
});

describe('opener copy rules', () => {
  const allOpeners = [
    ...IDEOLOGIES.flatMap((ideology) => TOPICS.map((topic) => getPartnerOpener(topic, ideology))),
    GENERIC_OPENER,
  ];

  it.each(allOpeners.map((o) => [o.slice(0, 40), o]))('%s...', (_label, opener) => {
    // Em and en dashes read as authored prose rather than as someone talking,
    // and they are the house tell for model-written text. The partner's own
    // messages never contain them, so the opener must not either.
    expect(opener).not.toMatch(/[—–]/);

    // Long enough to be a real position, short enough that the participant
    // reads it instead of skimming past it.
    const words = opener.split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(20);
    expect(words).toBeLessThanOrEqual(60);

    // Every opener has to hand the floor back: it ends on a question, or on an
    // explicit invitation to answer ("so tell me where you're coming from.",
    // "I'm curious how you see it.", "so tell me how."). Three of the approved
    // openers close the second way, which is an invitation in plain speech
    // rather than a missing question mark.
    const invites =
      opener.trim().endsWith('?') ||
      /(tell me|curious how you see it)\b[^.?!]*[.?!]$/i.test(opener.trim());
    expect(invites, `opener does not invite a response: ${opener}`).toBe(true);
  });
});
