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
 * Each opener sounds like someone starting a conversation rather than
 * delivering a position (Hanna, 28 Oct 2026): a greeting, a line saying what
 * the partner has been thinking about, then the partner's position in one
 * sentence. Every opener uses the same greeting and the same frame, so the
 * topic and the partner's ideology are the only things that differ. The
 * invitation to respond is still the intro card's closing question ("How do
 * you respond?"), so the opener ends on the position, not on a question.
 *
 * Keyed by the canonical study topic labels (the keys of TOPIC_PHRASES in
 * conversationIntro.ts, which are the seven presets in STUDY_TOPICS) crossed
 * with partner ideology. "Pick your own topic", a blank topic, and anything
 * unrecognised fall back to GENERIC_OPENER, which names no issue.
 */
const OPENERS: Record<IntroIdeology, Record<string, string>> = {
  right: {
    Immigration:
      "Hi, how's your day going? I've been thinking quite a bit about immigration lately. I really feel like if we don't enforce our immigration laws, citizenship stops meaning anything.",
    'Freedom of speech':
      "Hi, how's your day going? I've been thinking quite a bit about free speech lately. I really feel like calling an opinion hate speech is just a way to shut people up.",
    Guns: "Hi, how's your day going? I've been thinking quite a bit about guns lately. I own guns to protect my family, so bans are a hard no for me.",
    Housing:
      "Hi, how's your day going? I've been thinking quite a bit about housing lately. I'm in construction, and I really feel like permits and red tape are why houses cost so much.",
    Environment:
      "Hi, how's your day going? I've been thinking quite a bit about the environment lately. I want clean air, but not climate rules from people who never pay the bill.",
    Taxes:
      "Hi, how's your day going? I've been thinking quite a bit about taxes lately. I run a small business, and I really feel like government should cut spending before asking me for more.",
    Healthcare:
      "Hi, how's your day going? I've been thinking quite a bit about healthcare lately. It costs too much, but I really don't think handing it all to Washington will fix that.",
  },
  left: {
    Immigration:
      "Hi, how's your day going? I've been thinking quite a bit about immigration lately. I've organized workers for years, and immigrants were never why wages stayed flat.",
    'Freedom of speech':
      "Hi, how's your day going? I've been thinking quite a bit about free speech lately. I really feel like it's about protecting ordinary people from the powerful, not the other way around.",
    Guns: "Hi, how's your day going? I've been thinking quite a bit about guns lately. To me gun violence is a safety problem, so background checks are the bare minimum.",
    Housing:
      "Hi, how's your day going? I've been thinking quite a bit about housing lately. A home shouldn't be treated like a stock, and I really feel like renters need real protections.",
    Environment:
      "Hi, how's your day going? I've been thinking quite a bit about the environment lately. Climate change needs real action, and towns like mine need a real plan too.",
    Taxes:
      "Hi, how's your day going? I've been thinking quite a bit about billionaires and big corporations lately. I really feel like they should pay a lot more in taxes than they do.",
    Healthcare:
      "Hi, how's your day going? I've been thinking quite a bit about healthcare lately. I did home health care for years, and I really feel like nobody's care should depend on their job.",
  },
};

/**
 * Used when the participant chose their own topic, so no written opener exists
 * for the subject they picked. It states a disagreement without naming an
 * issue, which is the one thing that is true in every own-topic session.
 */
export const GENERIC_OPENER =
  "Hi, how's your day going? I think we probably see this one differently, but I'd love to hear your side first.";

/** The partner's fixed first message for this topic and ideology. */
export function getPartnerOpener(topic: string, ideology: IntroIdeology): string {
  const table = OPENERS[ideology];
  // Own-topic text is participant-supplied, so an own topic of "constructor" or
  // "toString" would otherwise reach Object.prototype and return a function.
  return Object.hasOwn(table, topic) ? table[topic] : GENERIC_OPENER;
}
