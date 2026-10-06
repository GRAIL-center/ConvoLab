/**
 * The full LAPP explanation behind "Learn more" in the four-moves section.
 *
 * Taken from the study's pre-survey orientation (Qualtrics QID86, "LAPP
 * Framework", export of 11 Aug 2026) so the landing page and the study teach
 * the same thing. Three edits for the landing page: the opening drops "You are
 * about to talk with an AI partner...", "stepmakes" is fixed, and the cycle
 * reminder is one line. The em dashes are kept on purpose (Hanna, 6 Oct 2026),
 * which is why this lives outside placeholderCopy and its no-dash test.
 */
export type LappGuideStep = {
  letter: string;
  name: string;
  heading: string;
  body: string;
  /** Example phrasings, shown in italics. */
  examples?: string[];
  bullets?: string[];
};

export const LAPP_GUIDE = {
  linkLabel: 'Learn more about LAPP',
  title: 'The LAPP approach',
  intro:
    "Use the four-step LAPP approach to make a hard conversation more productive. The goal is not to win — it's to have a real exchange where both sides feel heard.",
  steps: [
    {
      letter: 'L',
      name: 'Listen',
      heading: 'really listen',
      body: "Resist the urge to plan your response. Focus on understanding your partner's main point, the values or concerns behind it, and whether there's anything you can genuinely agree with.",
    },
    {
      letter: 'A',
      name: 'Acknowledge',
      heading: 'show you heard them',
      body: "Before sharing your own view, reflect back what you heard. This is not agreeing — it's confirming you received their message.",
      examples: [
        '"It sounds like you\'re saying that…"',
        '"I hear that you feel strongly about…"',
        '"I agree that [X] is a real problem." (if genuine)',
      ],
    },
    {
      letter: 'P',
      name: 'Pivot',
      heading: 'ask for your turn',
      body: "Signal that you'd like to share your perspective before you actually do. This small step makes your partner more ready to listen.",
      examples: [
        '"Can I share my take on this?"',
        '"I see it a bit differently — can I explain why?"',
      ],
    },
    {
      letter: 'P',
      name: 'Perspective',
      heading: 'share your view',
      body: "Now share your view in a way that's more likely to land:",
      bullets: [
        'Use "I" language, not absolute claims ("This is how I see it," not "This is just a fact.")',
        'Ground it in your own experience or what shaped your view.',
        'Find a small point of common ground if you can.',
      ],
    },
  ] as LappGuideStep[],
  reminderLabel: 'Quick reminder',
  reminder: 'Listen → Acknowledge → Pivot → Perspective',
  reminderNote: 'Repeat the cycle each time your partner shares something new.',
};
