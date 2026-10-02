import type { ConversationIntro } from '../ws/protocol.js';

export type IntroGender = 'male' | 'female';
export type IntroIdeology = 'left' | 'right';

export interface IntroInput {
  /** Full persona name as stored, e.g. "Megan Johnson". Only the first name is shown. */
  partnerName: string;
  gender: IntroGender;
  ideology: IntroIdeology;
  /** Study topic label exactly as Qualtrics sends it; undefined for non-study sessions. */
  topic?: string | null;
  /**
   * True in the variant where the partner has already sent a fixed opening
   * message (`studyPartnerOpens`). The participant is then answering rather
   * than starting, and the closing question says so.
   */
  partnerOpens?: boolean;
}

// How each canonical study topic reads inside "who sees ___ differently from you".
// Keys are the exact STUDY_TOPICS labels (study.ts). A label missing here, or
// "Pick your own topic", falls back to "politics": a participant's free-text
// topic cannot be slotted into the sentence safely, and it is already shown in
// the conversation header.
export const TOPIC_PHRASES: Record<string, string> = {
  Environment: 'the environment',
  'Freedom of speech': 'freedom of speech',
  Guns: 'guns',
  Healthcare: 'healthcare',
  Housing: 'housing',
  Immigration: 'immigration',
  Taxes: 'taxes',
};

const IDEOLOGY_LABELS: Record<IntroIdeology, string> = {
  left: 'liberal',
  right: 'conservative',
};

/**
 * The scene-setting text shown in place of the empty conversation, before the
 * participant's first message. Wording agreed by the team, 15 Sep 2026. Shown
 * identically in both study arms, so it cannot differ between them. (That is
 * the coaching/control axis; `partnerOpens` is a separate variant, split-tested
 * before the pilot and locked to one value for fielding, and it changes only
 * the closing question.)
 */
export function buildConversationIntro(input: IntroInput): ConversationIntro {
  const firstName = input.partnerName.trim().split(/\s+/)[0] || 'your partner';
  const pronoun = input.gender === 'female' ? 'She' : 'He';
  const ideology = IDEOLOGY_LABELS[input.ideology];
  const topicPhrase = input.topic ? TOPIC_PHRASES[input.topic] : undefined;
  // No usable topic (public app, or a free-text own topic): "sees things
  // differently" for the public app (Hanna, 16 Sep 2026); the own-topic case
  // keeps "politics" and points at the topic shown in the header.
  const sees = topicPhrase ?? (input.topic ? 'politics' : 'things');
  const cameUp = topicPhrase
    ? 'the topic has come up'
    : input.topic
      ? 'the topic you chose has come up'
      : 'politics has come up';

  // In the partner-opens variant the partner has already spoken, so asking the
  // participant how they begin describes a conversation that has not happened.
  const closing = input.partnerOpens ? 'How do you respond?' : 'How do you begin?';

  return {
    heading: `Meet ${firstName}.`,
    body: `${pronoun} is a ${ideology} who sees ${sees} differently from you. You have just sat down together and ${cameUp}. Imagine this is a real conversation. ${closing}`,
  };
}

/**
 * Recover gender and ideology from a partisan scenario slug, for sessions that
 * did not come through the study flow (the public app). Matches both the pilot
 * slugs (progressive-left-male, populist-right-female) and the public copies
 * (general-progressive-male, general-populist-female). Anything else, such as
 * the angry uncle or a custom scenario, returns null and gets no intro.
 */
export function personaFromScenarioSlug(
  slug: string | null | undefined
): { gender: IntroGender; ideology: IntroIdeology } | null {
  if (!slug) return null;
  const match = /(progressive|populist).*-(male|female)$/.exec(slug);
  if (!match) return null;
  return {
    ideology: match[1] === 'progressive' ? 'left' : 'right',
    gender: match[2] as IntroGender,
  };
}
