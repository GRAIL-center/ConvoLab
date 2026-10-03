import { describe, expect, it } from 'vitest';
import { shouldRunPostExchangeJobs } from '../lib/postExchangeGate.js';

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
