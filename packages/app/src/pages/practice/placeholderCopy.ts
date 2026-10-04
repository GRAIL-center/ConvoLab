/**
 * Copy for the public practice landing. This is the PI's approved copy as of
 * 2 Oct 2026; it no longer holds stand-in text. The uppercase stand-in marker
 * (PLACE + HOLDER + colon, spelled split here so a repo grep stays clean) must
 * never appear here again; placeholderCopy.test.ts enforces this. Keep the
 * keys stable.
 */
export const placeholderCopy = {
  heroHeadline: 'Practice the conversation you keep avoiding.',
  heroSupport:
    'Talk with an AI partner who genuinely disagrees with you, while a coach trains you to navigate the conversation better.',
  purdueLine: 'Built by researchers at Harvard and Purdue University.',

  howTitle: 'How it works',
  howSteps: [
    {
      title: 'Pick a partner',
      body: 'Choose someone whose views differ from yours, from a relative at the holiday table to a coworker.',
    },
    {
      title: 'Have the conversation',
      body: 'Talk the way you would in real life. Your partner holds their ground.',
    },
    {
      title: 'Get coached as you go',
      body: 'A coach suggests how to listen, acknowledge, and share your own view.',
    },
  ],

  whyTitle: 'Why ConvoLab exists',
  whyBody:
    'Hard conversations across political lines are where relationships fray. ConvoLab gives you a low-stakes place to rehearse them, so you can feel more confident at the next one.',
  whyPanels: [
    {
      title: 'A partner who pushes back',
      body: 'Your partner holds a real position and will not fold just to make you comfortable.',
    },
    {
      title: 'A coach in your corner',
      body: 'Private guidance helps you stay curious when the urge is to argue or shut down.',
    },
    {
      title: 'Skill over scorekeeping',
      body: 'The point is practicing how to have the conversation, not converting anyone.',
    },
  ],

  archetypesLabel: 'Who you might meet',
  archetypesHint: 'Archetypes only. You choose a specific partner next.',

  benefitsTitle: 'Benefits',
  benefits: [
    {
      title: 'Low stakes',
      body: 'Say the clumsy thing here instead of at the dinner table.',
    },
    {
      title: 'Real-time guidance',
      body: 'Coaching arrives while the conversation is still happening.',
    },
    {
      title: 'Feedback on every turn',
      body: 'See how each reply did on listening, acknowledging, pivoting, and perspective.',
    },
    {
      title: 'About ten minutes',
      body: 'One short conversation. Leave whenever you like.',
    },
  ],

  lappTitle: 'Listen, Acknowledge, Pivot, Perspective.',
  lappIntro: 'Four moves that keep a difficult conversation from collapsing into a fight.',
  lappDetails: {
    Listen: 'Hear what actually matters underneath their position.',
    Acknowledge: 'Name something real in what they said, without agreeing to all of it.',
    Pivot: 'Ask whether they are open to hearing how you see it, and wait for the answer.',
    Perspective: 'Speak in the first person about what you believe and why.',
  } as Record<string, string>,

  aboutTitle: 'About',
  aboutMission:
    'ConvoLab is a research project on talking across political difference. We build tools that let anyone practice the skills that keep those conversations going.',
  aboutMission2:
    'Conversations you have here help us understand what types of communication actually work, and for whom.',
  teamTitle: 'The team',
  team: [
    { initials: 'HS', name: 'Hanna Sistek', role: 'Principal investigator' },
    { initials: 'DS', name: 'Daniel Schiff', role: 'Faculty mentor and co-PI' },
    { initials: 'AL', name: 'Andrew Le Blanc', role: 'Developer' },
    { initials: 'AN', name: 'Anuj Krish Nair', role: 'Developer' },
    { initials: 'BA', name: 'Brinda Akuthota', role: 'Developer' },
    { initials: 'KK', name: 'Kiki Khosla', role: 'Developer' },
    { initials: 'NA', name: 'Nebras Alam', role: 'Developer' },
    { initials: 'RS', name: 'Rohan Sunchu', role: 'Developer' },
    { initials: 'AR', name: 'Abbey Ripstra', role: 'Design researcher (consulting)' },
    { initials: 'MJ', name: 'Mikael Johansson', role: 'Technologist (consulting)' },
  ],
  contactTitle: 'Contact',
  contactBody: 'Questions about the project? Email us at',
  contactEmail: 'hsistek@fas.harvard.edu',

  faqTitle: 'FAQ',
  faq: [
    {
      q: 'Do I need an account?',
      a: 'No. You can continue as a guest. Signing in keeps your past conversations.',
    },
    {
      q: 'Is my conversation private?',
      a: 'Your conversation is stored on our servers so the app can work, so we can improve the coach, and so our research team can study what works. The AI providers that generate the partner and coach replies process it under agreements that do not let them keep it or train on it. We do not sell it or share it outside the research team. If you signed in, your conversations are tied to your account; if you were a guest, email us the date and the partner you talked to and we will remove it.',
    },
    {
      q: 'Is the partner a real person?',
      a: 'No. Your partner and your coach are AI, built to hold a consistent point of view.',
    },
    {
      q: 'Will it try to change my mind?',
      a: "No. The goal is practicing the conversation, not changing anyone's views.",
    },
    {
      q: 'How long does it take?',
      a: 'About ten minutes for one conversation.',
    },
  ],

  practiceGoodFor: 'Good practice when you want to rehearse staying present under disagreement.',
} as const;

/** Anonymous marketing archetypes. Never use study persona names here. */
export const MARKETING_ARCHETYPES = [
  { id: 'holiday', label: 'Holiday table relative', hint: 'Family dinner politics' },
  { id: 'systems', label: 'Progressive left', hint: 'Structural arguments' },
  { id: 'community', label: 'MAGA right', hint: 'Fairness and institutions' },
  { id: 'coworker', label: 'Defensive coworker', hint: 'Workplace feedback' },
] as const;
