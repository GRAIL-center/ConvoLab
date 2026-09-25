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
 * Keyed by the canonical study topic labels (the keys of TOPIC_PHRASES in
 * conversationIntro.ts, which are the seven presets in STUDY_TOPICS) crossed
 * with partner ideology. "Pick your own topic", a blank topic, and anything
 * unrecognised fall back to GENERIC_OPENER, which names no issue.
 */
const OPENERS: Record<IntroIdeology, Record<string, string>> = {
  right: {
    Immigration:
      "I'll be honest, immigration is where I get frustrated. We have laws about who comes in, and when they aren't enforced I don't see what citizenship is supposed to mean anymore. I'm guessing you see it differently, so tell me where you're coming from.",
    'Freedom of speech':
      "Free speech is a big one for me. I keep seeing ordinary political opinions labeled misinformation or hate speech so somebody can shut them down, and I think a free country has to put up with speech it doesn't like. Where do you land on that?",
    Guns: "I grew up around guns and I own them. To me that's about self-defense and taking responsibility for my own family. I can talk about keeping guns away from people who are clearly dangerous, but broad bans are a hard no for me. How do you see it?",
    Housing:
      "I'm in construction, so I see why houses cost what they do: permits, materials, fees, and rules that make every project slower and pricier. If we want ordinary people to afford a home, we have to make it easier to build. Where would you start?",
    Environment:
      "I want clean air and water like anyone. What I don't want is climate policy written by people who have never lived in a steel town, where the bill lands on energy prices and factory jobs. What's your take?",
    Taxes:
      "I do the books for a small contracting business, so taxes aren't abstract to me. After payroll, insurance, materials and fuel there isn't much left, and I'd rather see government cut spending before it asks for more. Where are you on this?",
    Healthcare:
      "We agree healthcare costs too much, I'm sure of that. Where I get off the train is handing the whole system to the federal government. I don't trust the insurers or the bureaucracy, and I'd rather have real competition and real prices. How do you think about it?",
  },
  left: {
    Immigration:
      "I've spent years organizing tenants and workers, and I've never seen immigrants be the reason rents went up or wages stayed flat. I want legal pathways and due process, and employers who exploit people held accountable. I'm guessing you'd put the emphasis somewhere else. Where?",
    'Freedom of speech':
      'To me free speech is mostly about protecting workers, protesters and reporters from the people with power over them. I get nervous when powerful people act like free speech means nobody is allowed to push back on them. Where do you come down on it?',
    Guns: "I see gun violence as a public safety problem first. Background checks, safe storage and red-flag rules with due process seem like the minimum to me. I know plenty of people own guns responsibly, so I'm curious how you see it.",
    Housing:
      "Housing is the issue I live inside every day. I've watched families get pushed out by rent hikes and evictions, and I don't think a home should be treated like a stock. I want tenant protections and a lot more public housing. Where do you start on this?",
    Environment:
      "I think climate change needs serious public action. I'm also from Youngstown, so I know what it sounds like when someone tells a whole town its jobs are obsolete. I want clean energy and real investment in the places that lose out. What's your view?",
    Taxes:
      "I think billionaires and big corporations should be paying a lot more in taxes than they do. That money funds schools, hospitals and childcare, and it keeps a few people from holding all the power. I'm guessing you see taxes differently, so tell me how.",
    Healthcare:
      "I did home health care for years, and I watched one illness take down whole families. I don't think a kid's care should depend on a parent's insurance plan. I want healthcare guaranteed for everyone. How do you see it?",
  },
};

/**
 * Used when the participant chose their own topic, so no written opener exists
 * for the subject they picked. It states a disagreement without naming an
 * issue, which is the one thing that is true in every own-topic session.
 */
export const GENERIC_OPENER =
  "So this is the topic you wanted to talk about. I'll be straight with you: I probably see it differently than you do, but I'd rather hear your side than guess. Where do you want to start?";

/** The partner's fixed first message for this topic and ideology. */
export function getPartnerOpener(topic: string, ideology: IntroIdeology): string {
  const table = OPENERS[ideology];
  // Own-topic text is participant-supplied, so an own topic of "constructor" or
  // "toString" would otherwise reach Object.prototype and return a function.
  return Object.hasOwn(table, topic) ? table[topic] : GENERIC_OPENER;
}
