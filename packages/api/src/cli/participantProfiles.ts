/**
 * Survey-grounded participant profiles for synthetic conversations.
 *
 * Mirrors the real study flow (ConvoLab_Policy_Belief_Questions4.xlsx, V10):
 * participants pick one of seven policy topics, answer four 0-10 issue-position
 * items for it, get a LAPP introduction, then talk with an out-partisan AI
 * partner — free to drift beyond their chosen topic.
 *
 * The synthetic participant samples a belief profile from the same items so
 * training transcripts carry realistic, internally consistent positions.
 */

interface TopicItem {
  construct: string;
  /** Item essence, phrased for a persona prompt (adapted V10 wording) */
  statement: string;
  /**
   * How a liberal-leaning respondent scores on the 0-10 scale:
   * 'high' → 6-10, 'low' → 0-4, 'mixed' → genuinely cross-cutting (3-8)
   */
  liberalEnd: 'high' | 'low' | 'mixed';
}

export const TOPICS: Record<string, TopicItem[]> = {
  Environment: [
    {
      construct: 'Growth-environment causal belief',
      statement: 'Economic growth always harms the environment',
      liberalEnd: 'mixed',
    },
    {
      construct: 'Environment-over-growth value tradeoff',
      statement:
        'Protecting the environment should be given priority, even if it causes slower economic growth and some loss of jobs',
      liberalEnd: 'high',
    },
    {
      construct: 'Federal climate action',
      statement: 'The federal government doing more to reduce the effects of global climate change',
      liberalEnd: 'high',
    },
    {
      construct: 'Cost-bearing environmental protection',
      statement: 'Paying higher taxes in order to protect the environment',
      liberalEnd: 'high',
    },
  ],
  'Freedom of Speech': [
    {
      construct: 'Offense/speech climate belief',
      statement: 'People today are too easily offended by things others say',
      liberalEnd: 'low',
    },
    {
      construct: 'Press freedom norm',
      statement: 'News organizations should be free to criticize political leaders',
      liberalEnd: 'high',
    },
    {
      construct: 'Restricting journalist access',
      statement:
        "Elected officials restricting journalists' access to information about government decision-making",
      liberalEnd: 'low',
    },
    {
      construct: 'Platform false-information restriction',
      statement:
        'Technology companies taking steps to restrict false information online, even if it limits free publishing',
      liberalEnd: 'high',
    },
  ],
  Guns: [
    {
      construct: 'Gun violence problem belief',
      statement: 'Gun violence is a serious problem in the United States today',
      liberalEnd: 'high',
    },
    {
      construct: 'Public safety versus gun access value',
      statement:
        'Preventing gun violence should take priority, even if it means placing more limits on gun access',
      liberalEnd: 'high',
    },
    {
      construct: 'Assault-style rifle sales ban',
      statement: 'Banning the sale of semi-automatic "assault-style" rifles',
      liberalEnd: 'high',
    },
    {
      construct: 'Private-sale background checks',
      statement: 'Requiring background checks for gun purchases at gun shows or private sales',
      liberalEnd: 'high',
    },
  ],
  Healthcare: [
    {
      construct: 'Healthcare affordability problem belief',
      statement: 'The cost of health care is a serious problem for people and families in the US',
      liberalEnd: 'high',
    },
    {
      construct: 'Government healthcare responsibility value',
      statement:
        "It is the government's responsibility to provide health care for people who are sick",
      liberalEnd: 'high',
    },
    {
      construct: 'Health-insurance assistance spending',
      statement:
        'Increasing government spending to help people pay for health insurance when they cannot afford it',
      liberalEnd: 'high',
    },
    {
      construct: 'Medicare-for-all / national health plan',
      statement:
        'A national health plan (Medicare-for-all) where all Americans get insurance from a single government plan',
      liberalEnd: 'high',
    },
  ],
  Housing: [
    {
      construct: 'Affordable housing availability problem',
      statement:
        'The availability of affordable housing in my local community is a serious problem',
      liberalEnd: 'high',
    },
    {
      construct: 'Government housing responsibility',
      statement:
        "It is the government's responsibility to provide decent housing for people who cannot afford it",
      liberalEnd: 'high',
    },
    {
      construct: 'Zoning and land-use reform incentives',
      statement:
        'Incentives for local communities to remove zoning restrictions that prevent building more housing',
      liberalEnd: 'mixed',
    },
    {
      construct: 'Rent stabilization',
      statement: 'A policy to cap rent increases at 5 percent a year',
      liberalEnd: 'high',
    },
  ],
  Immigration: [
    {
      construct: 'Illegal immigration problem belief',
      statement: 'Illegal immigration is a serious problem in the United States today',
      liberalEnd: 'low',
    },
    {
      construct: 'Immigration openness as national identity',
      statement:
        "America's openness to people from all over the world is essential to who we are as a nation",
      liberalEnd: 'high',
    },
    {
      construct: 'Legal immigration levels',
      statement: 'Increasing the number of legal immigrants the United States admits',
      liberalEnd: 'high',
    },
    {
      construct: 'Pathway to citizenship',
      statement:
        'A path to citizenship for unauthorized immigrants who obey the law, pay a fine, and pass security checks',
      liberalEnd: 'high',
    },
  ],
  Taxes: [
    {
      construct: 'Corporate tax fairness belief',
      statement: 'Some corporations do not pay their fair share in federal taxes',
      liberalEnd: 'high',
    },
    {
      construct: 'Billionaire fortunes value',
      statement:
        'It is bad for the country when some people have personal fortunes of a billion dollars or more',
      liberalEnd: 'high',
    },
    {
      construct: 'Tax rates on high-income households',
      statement: 'Raising tax rates on household income over $400,000',
      liberalEnd: 'high',
    },
    {
      construct: 'Tax rates on large businesses',
      statement: 'Raising tax rates on large businesses and corporations',
      liberalEnd: 'high',
    },
  ],
};

export type DialogueSkill = 'novice' | 'developing' | 'skilled';

export interface ParticipantProfile {
  topic: string;
  intensity: 'moderate' | 'strong';
  skill: DialogueSkill;
  positions: Array<{ construct: string; score: number }>;
  personaText: string;
  openingInstruction: string;
}

/**
 * Real participants vary widely in dialogue skill and in how well they apply
 * LAPP right after learning it. The corpus needs that spread — the scorer must
 * see 0s and 1s, not just earnest 4s and 5s.
 */
const SKILL_INSTRUCTIONS: Record<DialogueSkill, string> = {
  novice: [
    'You skimmed the LAPP introduction (Listen, Acknowledge, Pivot to a question, share your',
    'Perspective) but in the moment you mostly forget it. You lead with your own opinions,',
    'correct facts you think are wrong, and cite things you read. When your uncle pushes',
    'your buttons you get defensive or sarcastic, interrupt with counterpoints, and rarely',
    'ask him anything about his experience. You do love him and occasionally catch yourself',
    'and soften — but the old habits win most turns.',
  ].join('\n'),
  developing: [
    'You just learned the LAPP method (Listen, Acknowledge, Pivot to a question, share your',
    'Perspective) and are trying to use it, with mixed success. Some turns you genuinely ask',
    'and acknowledge; other turns you slip — an "I hear you, but..." followed immediately by',
    'a counterargument, a fact-check where a question would have worked, or a longer lecture',
    'when a provocation lands. The effort is visible but inconsistent.',
  ].join('\n'),
  skilled: [
    'You just refreshed the LAPP method (Listen, Acknowledge, Pivot to a question, share your',
    'Perspective) and you are naturally good at this. You reflect back what your uncle actually',
    'said, name the feeling or value underneath it, ask curious follow-up questions before',
    'sharing your view, and when you do share it you use personal stories rather than',
    'statistics. You stay warm even when provoked.',
  ].join('\n'),
};

function randInt(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function sampleSkill(): DialogueSkill {
  const r = Math.random();
  if (r < 0.3) return 'novice';
  if (r < 0.7) return 'developing';
  return 'skilled';
}

function sampleScore(item: TopicItem, intensity: 'moderate' | 'strong'): number {
  if (item.liberalEnd === 'mixed') return randInt(3, 8);
  const strong = intensity === 'strong';
  if (item.liberalEnd === 'high') return strong ? randInt(8, 10) : randInt(5, 8);
  return strong ? randInt(0, 2) : randInt(2, 5);
}

/**
 * Sample a liberal-leaning participant profile. Topic is random unless given;
 * intensity and dialogue skill vary so the corpus spans weak-to-strong LAPP
 * performance, not just earnest practitioners.
 */
export function generateParticipantProfile(
  topic?: string,
  skill?: DialogueSkill
): ParticipantProfile {
  const topics = Object.keys(TOPICS);
  const chosen = topic && TOPICS[topic] ? topic : topics[randInt(0, topics.length - 1)];
  const intensity: 'moderate' | 'strong' = Math.random() < 0.4 ? 'moderate' : 'strong';
  const chosenSkill = skill ?? sampleSkill();

  const items = TOPICS[chosen];
  const positions = items.map((item) => ({
    construct: item.construct,
    score: sampleScore(item, intensity),
  }));

  const positionLines = items
    .map((item, i) => `- "${item.statement}": you're at ${positions[i].score}/10`)
    .join('\n');

  const personaText = [
    'You are role-playing a study participant in a research study on cross-partisan dialogue.',
    'You lean liberal/Democratic. You are about to have a text conversation with your',
    'MAGA-aligned uncle Dale, who lives in rural Indiana. You care about keeping the',
    'relationship warm while being honest.',
    '',
    `In the pre-survey you chose "${chosen}" as the issue you most want to get better at discussing,`,
    'and you gave these positions (0 = strongly disagree/oppose, 10 = strongly agree/favor):',
    positionLines,
    '',
    SKILL_INSTRUCTIONS[chosenSkill],
    '',
    `Start from your chosen topic, but this is a natural family conversation: follow it wherever`,
    'it goes, and bring up other issues if that feels natural. Stay consistent with your survey',
    'positions. Reply with ONLY your next conversational turn, 1-3 sentences, casual texting tone,',
    'no stage directions, and never use bracketed placeholders like [state] or [name] —',
    'if you do not know a detail, speak naturally without it.',
  ].join('\n');

  const openingInstruction = `(Open the conversation with your uncle: bring up ${chosen.toLowerCase()} in your own words, the way you might over text.)`;

  return {
    topic: chosen,
    intensity,
    skill: chosenSkill,
    positions,
    personaText,
    openingInstruction,
  };
}
