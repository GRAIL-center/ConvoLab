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
}

// How each canonical study topic reads inside "who sees ___ differently from you".
// Keys are the exact STUDY_TOPICS labels (study.ts). A label missing here, or
// "Pick your own topic", falls back to "politics": a participant's free-text
// topic cannot be slotted into the sentence safely, and it is already shown in
// the conversation header.
const TOPIC_PHRASES: Record<string, string> = {
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
 * identically in both study arms, so it cannot differ between them.
 */
export function buildConversationIntro(input: IntroInput): ConversationIntro {
  const firstName = input.partnerName.trim().split(/\s+/)[0] || 'your partner';
  const pronoun = input.gender === 'female' ? 'She' : 'He';
  const ideology = IDEOLOGY_LABELS[input.ideology];
  const topicPhrase = input.topic ? TOPIC_PHRASES[input.topic] : undefined;
  const sees = topicPhrase ?? 'politics';
  const cameUp = topicPhrase
    ? 'the topic has come up'
    : input.topic
      ? 'the topic you chose has come up'
      : 'politics has come up';

  return {
    heading: `Meet ${firstName}.`,
    body: `${pronoun} is a ${ideology} who sees ${sees} differently from you. You have just sat down together and ${cameUp}. Imagine this is a real conversation. How do you begin?`,
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
