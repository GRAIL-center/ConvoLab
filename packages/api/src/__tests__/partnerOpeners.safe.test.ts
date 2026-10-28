import { describe, expect, it } from 'vitest';
import { TOPIC_PHRASES } from '../lib/conversationIntro.js';
import { GENERIC_OPENER, getPartnerOpener } from '../lib/partnerOpeners.js';

const IDEOLOGIES = ['left', 'right'] as const;
const TOPICS = Object.keys(TOPIC_PHRASES);
const GREETING = "Hi, how's your day going?";

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

  it.each(IDEOLOGIES)('frames every topic opener the same way (%s)', (ideology) => {
    for (const topic of TOPICS) {
      expect(getPartnerOpener(topic, ideology)).toContain("I've been thinking quite a bit about");
    }
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

    // Every opener starts the same friendly way, so the greeting cannot vary
    // with topic or ideology (Hanna, 28 Oct 2026).
    const text = opener.trim();
    expect(
      text.startsWith(GREETING),
      `opener does not start with the shared greeting: ${opener}`
    ).toBe(true);

    // The invitation to respond is the intro card's closing question ("How do
    // you respond?"), so the opener ends on the partner's position, not on a
    // question to the participant.
    expect(text, `opener does not end on a statement: ${opener}`).toMatch(/\.$/);

    // Greeting plus one or two short sentences: friendly, not a speech.
    const words = text.split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(15);
    expect(words).toBeLessThanOrEqual(40);
  });
});
