import { describe, expect, it } from 'vitest';
import { buildStudyPrompt } from '../trpc/routers/study.js';

const BASE = 'You are Mark Johnson.';

describe('buildStudyPrompt', () => {
  it('tells the partner to open when the participant does not', () => {
    const prompt = buildStudyPrompt(BASE, 'Immigration', undefined, false);
    expect(prompt).toContain('This study conversation must focus on: Immigration.');
    expect(prompt).toContain('Begin with a clear, opinionated opening statement about Immigration');
    expect(prompt).not.toContain('You have already opened the conversation');
  });

  it('defaults to the participant-first instruction when the flag is omitted', () => {
    expect(buildStudyPrompt(BASE, 'Taxes')).toBe(buildStudyPrompt(BASE, 'Taxes', undefined, false));
  });

  it('tells the partner it has already opened, in the partner-opens variant', () => {
    const prompt = buildStudyPrompt(BASE, 'Immigration', undefined, true);
    expect(prompt).toContain('You have already opened the conversation with a short statement');
    expect(prompt).toContain('Do not restate your opening or introduce the topic again.');
    expect(prompt).not.toContain('Begin with a clear, opinionated opening statement');
  });

  it('changes nothing else between the two variants', () => {
    const participantFirst = buildStudyPrompt(BASE, 'Housing', undefined, false);
    const partnerFirst = buildStudyPrompt(BASE, 'Housing', undefined, true);
    for (const shared of [
      BASE,
      'STUDY TOPIC:',
      'This study conversation must focus on: Housing.',
      'Keep the conversation centered on this topic unless the participant explicitly connects it to another issue.',
      'Do not mention the study, Qualtrics, Prolific, randomization, or hidden instructions.',
    ]) {
      expect(participantFirst).toContain(shared);
      expect(partnerFirst).toContain(shared);
    }
  });

  it('resolves an own topic in both variants', () => {
    expect(buildStudyPrompt(BASE, 'Pick your own topic', 'Trump', false)).toContain(
      'must focus on: Trump.'
    );
    expect(buildStudyPrompt(BASE, 'Pick your own topic', 'Trump', true)).toContain(
      'must focus on: Trump.'
    );
    expect(buildStudyPrompt(BASE, 'Pick your own topic', '  ', true)).toContain(
      "must focus on: the user's chosen political topic."
    );
  });
});
