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
 * Each opener is a single sentence stating the partner's position. It does not
 * ask the participant anything: the invitation to respond is the intro card's
 * closing question ("How do you respond?"), not part of the opener.
 *
 * Keyed by the canonical study topic labels (the keys of TOPIC_PHRASES in
 * conversationIntro.ts, which are the seven presets in STUDY_TOPICS) crossed
 * with partner ideology. "Pick your own topic", a blank topic, and anything
 * unrecognised fall back to GENERIC_OPENER, which names no issue.
 */
const OPENERS: Record<IntroIdeology, Record<string, string>> = {
  right: {
    Immigration:
      "I'll be honest, immigration is where I get frustrated: we have laws about who comes in, and when they aren't enforced I don't see what citizenship is supposed to mean anymore.",
    'Freedom of speech':
      'Free speech is a big one for me, because I keep seeing ordinary political opinions labeled misinformation or hate speech just so somebody can shut them down.',
    Guns: "I grew up around guns and I own them, and to me that's about defending my own family, so broad bans are a hard no for me.",
    Housing:
      "I'm in construction, so I see why houses cost what they do: permits, materials, fees and rules that make every project slower and pricier.",
    Environment:
      "I want clean air and water like anyone, but I don't want climate policy written by people who have never lived in a steel town and never pay the bill for it.",
    Taxes:
      "I do the books for a small contracting business, and after payroll, insurance, materials and fuel there isn't much left, so I'd rather see government cut spending before it asks for more.",
    Healthcare:
      'We agree healthcare costs too much, but handing the whole system to the federal government is where I get off the train.',
  },
  left: {
    Immigration:
      "I've spent years organizing tenants and workers, and I've never once seen immigrants be the reason rents went up or wages stayed flat.",
    'Freedom of speech':
      'To me free speech is mostly about protecting workers, protesters and reporters from the people with power over them, not about powerful people escaping criticism.',
    Guns: 'I see gun violence as a public safety problem first, so background checks, safe storage and red-flag rules with due process seem like the bare minimum to me.',
    Housing:
      "Housing is the issue I live inside every day, and I don't think a home should be treated like a stock, so I want tenant protections and a lot more public housing.",
    Environment:
      'I think climate change needs serious public action, and coming from Youngstown I also know what it sounds like when someone tells a whole town its jobs are obsolete.',
    Taxes:
      'I think billionaires and big corporations should be paying a lot more in taxes than they do, because that money funds schools, hospitals and childcare.',
    Healthcare:
      'I did home health care for years and watched one illness take down whole families, so I want healthcare guaranteed for everyone.',
  },
};

/**
 * Used when the participant chose their own topic, so no written opener exists
 * for the subject they picked. It states a disagreement without naming an
 * issue, which is the one thing that is true in every own-topic session.
 */
export const GENERIC_OPENER =
  "I'll be straight with you: I probably see this differently than you do, but I'd rather hear your side than guess.";

/** The partner's fixed first message for this topic and ideology. */
export function getPartnerOpener(topic: string, ideology: IntroIdeology): string {
  const table = OPENERS[ideology];
  // Own-topic text is participant-supplied, so an own topic of "constructor" or
  // "toString" would otherwise reach Object.prototype and return a function.
  return Object.hasOwn(table, topic) ? table[topic] : GENERIC_OPENER;
}
