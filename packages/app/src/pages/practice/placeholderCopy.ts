/**
 * Copy for the public practice landing. This is the PI's approved copy as of
 * 2 Oct 2026; it no longer holds stand-in text. The uppercase stand-in marker
 * (PLACE + HOLDER + colon, spelled split here so a repo grep stays clean) must
 * never appear here again; placeholderCopy.test.ts enforces this. Keep the
 * keys stable.
 */
export type TeamMember = {
  initials: string;
  name: string;
  role: string;
  /** 50 to 70 words, third person (80 max). A card with a bio opens it on click; without one it stays a plain card. */
  bio?: string;
  /** One optional link shown under the bio, e.g. a personal site. */
  link?: { label: string; url: string };
  /** Square headshot under packages/app/public/team/, e.g. '/team/abbey-ripstra.jpg'. Shown round; initials otherwise. */
  photo?: string;
};

export const placeholderCopy = {
  heroHeadline: 'Practice the conversation you keep avoiding.',
  ctaLabel: 'Get started',
  heroSupport:
    'Talk it out with an AI partner in a low\u2011stakes environment, while a coach trains you to navigate the conversation better.',
  purdueLine: 'Built by researchers at Harvard and Purdue University.',

  howTitle: 'How it works',
  howSteps: [
    {
      title: 'Pick an AI partner',
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

  whyTitle: 'Why practice',
  whyBody:
    'Hard conversations across political lines are where relationships CAN fray. ConvoLab gives you a low-stakes place to rehearse them, so you can feel more confident at the next one.',
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
  archetypesHint: 'Pick from the following AI partners.',

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
      body: 'See how you did on listening, acknowledging, pivoting, and perspective.',
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
    Acknowledge: 'Try to understand where they are coming from, even if you disagree with their opinions.',
    Pivot: 'Ask whether they are open to hearing your perspective and wait for the answer.',
    Perspective: 'Speak in the first person about what you believe and why.',
  } as Record<string, string>,

  aboutTitle: 'About',
  aboutMission:
    'ConvoLab is a research project on talking across political difference. We build tools that let anyone practice the skills that keep those conversations going.',
  aboutMission2:
    'Conversations you have here help us understand what types of communication actually work, and for whom.',
  teamTitle: 'The team',
  team: [
    {
      initials: 'HS',
      name: 'Hanna Sistek',
      role: 'Principal investigator',
      // Hanna's own wording, 7 Oct 2026 ("to" added before "improve").
      bio: 'Hanna Sistek is a political scientist and a Civil Discourse Fellow at the Edmond & Lily Safra Center for Ethics at Harvard University. After completing her dissertation on the negative impacts of political polarization, she set out to create practical solutions. Inspired by years of studying non-violent communication and role-playing hard conversations with her therapists, she created ConvoLab to help people build stronger communication skills. She hopes this will enable people to improve their personal relationships and build stronger families and communities.',
    },
    {
      initials: 'DS',
      name: 'Daniel Schiff',
      role: 'Faculty mentor and co-PI',
      // Facts from danielschiff.com/about; approved by Daniel, 5 Oct 2026.
      bio: "Daniel Schiff is an Associate Professor of Technology Policy in Purdue University's Department of Political Science and founding Co-Director of GRAIL, the Governance and Responsible AI Lab. His research examines how AI is governed, from public policy to industry practice, and its effects on education, work and misinformation. Before academia, he was JP Morgan Chase's founding Responsible AI Lead.",
    },
    {
      initials: 'AL',
      name: 'Andrew Le Blanc',
      role: 'Developer',
      photo: '/team/andrew-le-blanc.jpg',
      // Andrew's own wording, 6 Oct 2026; his two profiles are linked in place.
      bio: 'Andrew Le Blanc is a junior at Harvard College studying Computer Science. He enjoys building and researching technology at the intersection of artificial intelligence, software, and social impact. You can find his work at [github.com/andrewleblanc1](https://www.github.com/andrewleblanc1) and [linkedin.com/in/andrewleblanc1](https://www.linkedin.com/in/andrewleblanc1).',
    },
    {
      initials: 'AN',
      name: 'Anuj Krish Nair',
      role: 'Developer',
      // Anuj's own wording, 6 Oct 2026.
      bio: 'Anuj Krish Nair is a Purdue computer science undergraduate who enjoys turning AI ideas into products people actually use. He has worked on voice-based assistants, language-aware systems, and tools that evaluate how well AI models perform. Outside of class, he builds interactive web games and experiments with search and decision-making algorithms.',
    },
    {
      initials: 'BA',
      name: 'Brinda Akuthota',
      role: 'Developer',
      // Brinda's own wording, 6 Oct 2026.
      bio: 'Brinda Akuthota is a Purdue computer science undergraduate who develops tools and conversational systems for the ConvoLab project. She focuses on containerized backend deployments and interactive AI interfaces that support talking across political differences. She is passionate about building scalable software solutions that make complex communication tools intuitive and accessible.',
    },
    {
      initials: 'KK',
      name: 'Kiki Khosla',
      role: 'Developer',
      // Kiki's own wording, 6 Oct 2026.
      bio: 'Kiki Khosla is a Computer Science student at Purdue University with interests in technology, data, and innovation. Alongside his work with ConvoLab, he works on industry-focused projects through Purdue\u2019s Data Mine, including data and AI initiatives with Cummins, and serves as President of Boiler Bhangra. He enjoys collaborating with others, solving complex problems, and turning ideas into meaningful outcomes.',
    },
    {
      initials: 'NA',
      name: 'Nebras Alam',
      role: 'Developer',
      // Nebras's own wording, 6 Oct 2026.
      bio: 'Nebras Alam is a Computer Engineering student at Purdue University interested in the intersection of artificial intelligence, political science, and civic technology. At ConvoLab, he contributes to backend development, prompt engineering, experimental design, and research on cross-partisan dialogue. His work focuses on how AI can support more productive political conversations and improve the quality of democratic discourse.',
    },
    { initials: 'RS', name: 'Rohan Sunchu', role: 'Developer' },
    {
      initials: 'AR',
      name: 'Abbey Ripstra',
      role: 'Design researcher (consulting)',
      photo: '/team/abbey-ripstra.jpg',
      // Abbey's own wording, 5 Oct 2026; her company is linked in place.
      bio: 'Abbey is a human centered design researcher who conducts research informing design decisions and strategy. She runs [Design Research Services](https://www.designresearchservices.com/), a consultancy advising on and conducting design research work for a variety of clients. Abbey studied design research and strategy at the Institute of Design at the Illinois Institute of Technology. Part of her work is educating and mentoring people who want to use human centered design in their work to improve the world.',
    },
    {
      initials: 'MJ',
      name: 'Mikael Johansson',
      role: 'Technologist (consulting)',
      // Mikael's own wording, 4 Oct 2026; his two companies are linked in place.
      bio: 'Experienced startup and scale-up CTO, founder of [renable.com](https://renable.com) and [verke.co](https://verke.co). Keenly interested in everything from psychology and leadership, to artificial intelligence and distributed systems.',
    },
  ] as TeamMember[],
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
      a: "We store your conversation on our servers so the app can work, so we can improve the coach, and so our research team can study what works. The AI providers that write the partner's and coach's replies also process your messages, but our agreements with them do not allow them to keep conversations or to train their models on conversations. We do not sell conversations or share them outside the research team. If you signed in, your conversations are linked to your account. If you were a guest, email us the date and the partner you talked to, and we will remove that conversation.",
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
