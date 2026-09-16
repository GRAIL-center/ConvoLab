import { describe, expect, it } from 'vitest';
import { buildConversationIntro, personaFromScenarioSlug } from '../lib/conversationIntro.js';

describe('buildConversationIntro', () => {
  it('renders the agreed wording for a canonical study topic', () => {
    expect(
      buildConversationIntro({
        partnerName: 'Megan Johnson',
        gender: 'female',
        ideology: 'right',
        topic: 'Immigration',
      })
    ).toEqual({
      heading: 'Meet Megan.',
      body: 'She is a conservative who sees immigration differently from you. You have just sat down together and the topic has come up. Imagine this is a real conversation. How do you begin?',
    });
  });

  it('uses he / liberal for a male progressive and adds the article for the environment', () => {
    const intro = buildConversationIntro({
      partnerName: 'Mark Johnson',
      gender: 'male',
      ideology: 'left',
      topic: 'Environment',
    });
    expect(intro.heading).toBe('Meet Mark.');
    expect(intro.body).toMatch(/^He is a liberal who sees the environment differently from you\./);
  });

  it('falls back to politics when the participant picked their own topic', () => {
    const intro = buildConversationIntro({
      partnerName: 'Megan Johnson',
      gender: 'female',
      ideology: 'left',
      topic: 'Pick your own topic',
    });
    expect(intro.body).toMatch(/sees politics differently from you\./);
    expect(intro.body).toMatch(/the topic you chose has come up\./);
  });

  it('has no topic clause for a public-app session', () => {
    const intro = buildConversationIntro({
      partnerName: 'Ashley Brown',
      gender: 'female',
      ideology: 'right',
    });
    expect(intro).toEqual({
      heading: 'Meet Ashley.',
      body: 'She is a conservative who sees politics differently from you. You have just sat down together and politics has come up. Imagine this is a real conversation. How do you begin?',
    });
  });
});

describe('personaFromScenarioSlug', () => {
  it.each([
    ['progressive-left-male', { ideology: 'left', gender: 'male' }],
    ['populist-right-female', { ideology: 'right', gender: 'female' }],
    ['general-progressive-female', { ideology: 'left', gender: 'female' }],
    ['general-populist-male', { ideology: 'right', gender: 'male' }],
  ])('%s', (slug, expected) => {
    expect(personaFromScenarioSlug(slug)).toEqual(expected);
  });

  it.each([
    'angry-uncle-thanksgiving',
    'difficult-coworker',
    'custom',
    null,
    undefined,
  ])('returns null for %s', (slug) => {
    expect(personaFromScenarioSlug(slug)).toBeNull();
  });
});
