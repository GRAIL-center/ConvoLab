import type { IntroIdeology } from './conversationIntro.js';

/**
 * The partner's fixed opening statement, for the variant where the partner
 * speaks first (`studyPartnerOpens`).
 *
 * These are written, approved copy, not generated text. In the partner-opens
 * arm every participant assigned the same topic and partner ideology reads the
 * exact same first message, so the stimulus is identical across participants
 * and the participant's first turn is a response to a known prompt rather than
 * to whatever the model happened to produce. Do not edit these strings to fix
 * style: the wording is the instrument.
 *
 * Each opener is one spoken-length sentence (10 to 15 words) stating the
 * partner's position: the length of a sentence said aloud, not written prose.
 * It does not ask the participant anything: the invitation to respond is the
 * intro card's closing question ("How do you respond?"), not part of the
 * opener.
 *
 * Keyed by the canonical study topic labels (the keys of TOPIC_PHRASES in
 * conversationIntro.ts, which are the seven presets in STUDY_TOPICS) crossed
 * with partner ideology. "Pick your own topic", a blank topic, and anything
 * unrecognised fall back to GENERIC_OPENER, which names no issue.
 */
const OPENERS: Record<IntroIdeology, Record<string, string>> = {
  right: {
    Immigration: "If we don't enforce our immigration laws, citizenship stops meaning anything.",
    'Freedom of speech': 'Calling an opinion hate speech is just a way to shut people up.',
    Guns: 'I own guns to protect my family, so bans are a hard no for me.',
    Housing: "I'm in construction, and permits and red tape are why houses cost so much.",
    Environment: 'I want clean air, not climate rules from people who never pay the bill.',
    Taxes: 'I run a small business, and government should cut spending before asking me for more.',
    Healthcare: "Healthcare costs too much, but handing it all to Washington won't fix that.",
  },
  left: {
    Immigration:
      "I've organized workers for years, and immigrants were never why wages stayed flat.",
    'Freedom of speech':
      'Free speech is about protecting ordinary people from the powerful, not the other way around.',
    Guns: 'Gun violence is a safety problem, so background checks are the bare minimum.',
    Housing: "A home shouldn't be treated like a stock, so renters need real protections.",
    Environment: 'Climate change needs real action, and towns like mine need a real plan too.',
    Taxes: 'Billionaires and big corporations should pay a lot more in taxes than they do.',
    Healthcare: "I did home health care for years, and nobody's care should depend on their job.",
  },
};

/**
 * Used when the participant chose their own topic, so no written opener exists
 * for the subject they picked. It states a disagreement without naming an
 * issue, which is the one thing that is true in every own-topic session.
 */
export const GENERIC_OPENER =
  "I probably see this differently than you, but I'd rather hear your side first.";

/** The partner's fixed first message for this topic and ideology. */
export function getPartnerOpener(topic: string, ideology: IntroIdeology): string {
  const table = OPENERS[ideology];
  // Own-topic text is participant-supplied, so an own topic of "constructor" or
  // "toString" would otherwise reach Object.prototype and return a function.
  return Object.hasOwn(table, topic) ? table[topic] : GENERIC_OPENER;
}
