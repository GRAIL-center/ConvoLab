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
 * delivering a position (Hanna, 28 Oct 2026): the same greeting, then a line
 * saying what the partner has been thinking about, then the partner's
 * position. Since the team's revision of 27 Nov 2026 (source:
 * ConvoLab_partner_openers_10Nov2026.docx, "Proposed revision" column) some
 * openers also give the partner a personal detail ("I run a small business",
 * "I've been renting a home for years"), so the middle line is no longer
 * identical across openers; only the greeting is. The invitation to respond
 * is still the intro card's closing question ("How do you respond?"), so the
 * opener ends on the position, not on a question.
 *
 * Keyed by the canonical study topic labels (the keys of TOPIC_PHRASES in
 * conversationIntro.ts, which are the seven presets in STUDY_TOPICS) crossed
 * with partner ideology. "Pick your own topic", a blank topic, and anything
 * unrecognised fall back to GENERIC_OPENER, which names no issue.
 */
const OPENERS: Record<IntroIdeology, Record<string, string>> = {
  right: {
    Immigration:
      "Hi, how's your day going? I've been thinking quite a bit about immigration lately. I worry that if we don't enforce our immigration laws, citizenship stops meaning anything.",
    'Freedom of speech':
      "Hi, how's your day going? I've been thinking quite a bit about free speech lately. I worry that calling an opinion hate speech is just a way to shut people up.",
    Guns: "Hi, how's your day going? I've owned a gun for years and I've been thinking quite a bit about gun bans lately. I have mine to protect my family, so honestly bans are a no for me.",
    Housing:
      "Hi, how's your day going? I've been working in construction for years and have been thinking about housing lately. I feel like permits and red tape are why houses cost so much.",
    Environment:
      "Hi, how's your day going? I've been thinking quite a bit about the environment lately. I want clean air, but I worry about the cost of Washington's excessive regulations.",
    Taxes:
      "Hi, how's your day going? I run a small business and I've been thinking quite a bit about taxes lately. I really feel like the government should cut spending before asking me for more money.",
    Healthcare:
      "Hi, how's your day going? I've been thinking quite a bit about healthcare lately. It costs too much, but I think there are serious problems with universal healthcare.",
  },
  left: {
    Immigration:
      "Hi, how's your day going? I've organized workers for years and have been thinking quite a bit about immigration lately. I really feel like the wage stagnation we see was never related to immigrants.",
    'Freedom of speech':
      "Hi, how's your day going? I've been thinking quite a bit about free speech lately. I honestly think that harmful speech should be limited in the public sphere.",
    Guns: "Hi, how's your day going? I've been thinking quite a bit about gun violence lately. I see it as a safety problem. To me, background checks are the bare minimum.",
    Housing:
      "Hi, how's your day going? I've been renting a home for years and have been thinking quite a bit about housing lately. I really feel like renters need real protections.",
    Environment:
      "Hi, how's your day going? I've felt really worried about the environment lately. I honestly believe that climate change needs real actionable plans.",
    Taxes:
      "Hi, how's your day going? I've been thinking quite a bit about taxes lately. I really feel like billionaires and big corporations should pay a lot more in taxes than they do.",
    Healthcare:
      "Hi, how's your day going? I worked in home health care for years, and I feel like people's access to care should not depend on what insurance they can afford.",
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
