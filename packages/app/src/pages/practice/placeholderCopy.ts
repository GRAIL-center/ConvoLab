/**
 * Copy for the public practice landing. Anything starting with PLACEHOLDER:
 * is stand-in text waiting on final messaging; keep the keys stable.
 */
export const placeholderCopy = {
  heroHeadline: 'Practice the conversation you keep avoiding.',
  heroSupport:
    'Talk with an AI partner who genuinely disagrees with you, while a coach helps you stay in the conversation.',
  purdueLine: 'Brought to you by researchers at Purdue University',

  howTitle: 'How it works',
  howSteps: [
    {
      title: 'Pick a partner',
      body: 'PLACEHOLDER: Choose someone whose views differ from yours, from a holiday-table relative to a coworker.',
    },
    {
      title: 'Have the conversation',
      body: 'PLACEHOLDER: Talk the way you would in real life. Your partner holds their ground.',
    },
    {
      title: 'Get coached as you go',
      body: 'PLACEHOLDER: A private coach suggests how to listen, acknowledge, and share your view.',
    },
  ],

  whyTitle: 'Why ConvoLab exists',
  whyBody:
    'PLACEHOLDER: Hard conversations across political lines are where relationships fray. ConvoLab gives you a low-stakes place to rehearse them, without trying to win.',
  whyPanels: [
    {
      title: 'A partner who pushes back',
      body: 'PLACEHOLDER: Your dialog partner holds a real stance. They will not fold just to make you comfortable.',
    },
    {
      title: 'A coach on your side',
      body: 'PLACEHOLDER: Private guidance helps you stay curious when the urge is to argue or shut down.',
    },
    {
      title: 'Skill over scorekeeping',
      body: 'PLACEHOLDER: The point is staying in the conversation, not converting anyone.',
    },
  ],

  archetypesLabel: 'Who you might meet',
  archetypesHint: 'Archetypes only. You choose a specific partner next.',

  benefitsTitle: 'What you get out of it',
  benefits: [
    {
      title: 'Low stakes',
      body: 'PLACEHOLDER: Say the clumsy thing here instead of at the dinner table.',
    },
    {
      title: 'Real-time guidance',
      body: 'PLACEHOLDER: Coaching arrives while the conversation is still happening.',
    },
    {
      title: 'Feedback on every turn',
      body: 'PLACEHOLDER: See how each reply scored on listening, acknowledging, pivoting, and perspective.',
    },
    {
      title: 'About ten minutes',
      body: 'PLACEHOLDER: One short conversation. Leave whenever you like.',
    },
  ],

  lappTitle: 'Four moves. Listen, Acknowledge, Pivot, Perspective.',
  lappIntro: 'PLACEHOLDER: Four moves that keep difficult talk from collapsing into a fight.',
  lappDetails: {
    Listen: 'PLACEHOLDER: Hear what actually matters underneath their position.',
    Acknowledge:
      'PLACEHOLDER: Name something real in what they said, without agreeing to everything.',
    Pivot: 'PLACEHOLDER: Ask for space to share your own experience.',
    Perspective: 'PLACEHOLDER: Speak in first person about what you believe and why.',
  } as Record<string, string>,

  aboutTitle: 'About',
  aboutMission:
    'PLACEHOLDER: ConvoLab is a research project studying how people can talk across political difference. We build tools that let anyone practice the skills that keep those conversations going.',
  aboutMission2:
    'PLACEHOLDER: Conversations you have here help us understand which moves actually work, and for whom.',
  teamTitle: 'The team',
  team: [
    { initials: 'AB', name: 'PLACEHOLDER: Researcher name', role: 'Principal investigator' },
    { initials: 'CD', name: 'PLACEHOLDER: Researcher name', role: 'Research lead' },
    { initials: 'EF', name: 'PLACEHOLDER: Researcher name', role: 'Engineering' },
  ],
  contactTitle: 'Contact',
  contactBody: 'PLACEHOLDER: Questions about the project? Email us at',
  contactEmail: 'placeholder@purdue.edu',

  faqTitle: 'Questions',
  faq: [
    {
      q: 'Do I need an account?',
      a: 'No. You can continue as a guest. Signing in keeps your past conversations.',
    },
    {
      q: 'Is my conversation private?',
      a: 'PLACEHOLDER: Explain what is stored, for how long, and who can see it.',
    },
    {
      q: 'Is the partner a real person?',
      a: 'PLACEHOLDER: No. Your partner and coach are AI, built to hold a consistent point of view.',
    },
    {
      q: 'Will it try to change my mind?',
      a: 'PLACEHOLDER: No. The goal is practicing the conversation, not changing anyone’s views.',
    },
    {
      q: 'How long does it take?',
      a: 'About ten minutes for one conversation.',
    },
  ],

  practiceGoodFor:
    'PLACEHOLDER: Good practice when you want to rehearse staying present under disagreement.',
} as const;

/** Anonymous marketing archetypes. Never use study persona names here. */
export const MARKETING_ARCHETYPES = [
  { id: 'holiday', label: 'Holiday table relative', hint: 'Family dinner politics' },
  { id: 'systems', label: 'Systems-minded progressive', hint: 'Structural arguments' },
  { id: 'community', label: 'Community & distrust populist', hint: 'Fairness and institutions' },
  { id: 'coworker', label: 'Defensive coworker', hint: 'Workplace feedback' },
] as const;
