import { describe, expect, it } from 'vitest';
import { openingPartnerMessage, shouldRunPostExchangeJobs } from '../lib/postExchangeGate.js';

describe('shouldRunPostExchangeJobs', () => {
  it('holds the coach and scorer back on turn 1 when the participant opens', () => {
    expect(shouldRunPostExchangeJobs({ partnerOpens: false, participantTurnCount: 1 })).toBe(false);
  });

  it('runs from turn 2 onward when the participant opens', () => {
    expect(shouldRunPostExchangeJobs({ partnerOpens: false, participantTurnCount: 2 })).toBe(true);
  });

  it('runs from turn 1 when the partner opens, because that turn is already a response', () => {
    expect(shouldRunPostExchangeJobs({ partnerOpens: true, participantTurnCount: 1 })).toBe(true);
  });

  it('keeps running on later turns when the partner opens', () => {
    expect(shouldRunPostExchangeJobs({ partnerOpens: true, participantTurnCount: 2 })).toBe(true);
  });
});

describe('openingPartnerMessage', () => {
  const partner = (content: string, messageType = 'main') => ({
    role: 'partner',
    content,
    messageType,
  });
  const user = (content: string, messageType = 'main') => ({
    role: 'user',
    content,
    messageType,
  });

  it('returns the opener when the partner spoke first', () => {
    expect(
      openingPartnerMessage([
        partner('I have a view on this.'),
        user('I disagree.'),
        partner('Why?'),
      ])
    ).toBe('I have a view on this.');
  });

  it('returns undefined when the participant spoke first, even though a partner reply follows', () => {
    // The guard that matters: by scoring time the partner's REPLY is already in
    // the transcript, and it must never be presented as an opening statement.
    expect(openingPartnerMessage([user('Here is what I think.'), partner('I disagree.')])).toBe(
      undefined
    );
  });

  it('ignores an aside the participant sent to the coach before writing to the partner', () => {
    expect(
      openingPartnerMessage([
        user('Coach, what should I say?', 'aside'),
        partner('I have a view on this.'),
        user('I disagree.'),
      ])
    ).toBe('I have a view on this.');
  });

  it('returns undefined for an empty transcript', () => {
    expect(openingPartnerMessage([])).toBe(undefined);
  });

  it('returns undefined when the opener is blank', () => {
    expect(openingPartnerMessage([partner('   '), user('Hello.')])).toBe(undefined);
  });
});
