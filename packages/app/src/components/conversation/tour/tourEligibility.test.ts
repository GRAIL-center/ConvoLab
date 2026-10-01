import { describe, expect, it } from 'vitest';
import { isTourEligible, shouldAbortTourForViewport, visibleTourSteps } from './tourEligibility';

describe('isTourEligible', () => {
  const base = {
    ready: true,
    isStudySession: false,
    isDesktop: true,
    dismissed: false,
  };

  it('allows a connected practice session on desktop', () => {
    expect(isTourEligible(base)).toBe(true);
  });

  it('skips study sessions', () => {
    expect(isTourEligible({ ...base, isStudySession: true })).toBe(false);
  });

  it('skips small screens', () => {
    expect(isTourEligible({ ...base, isDesktop: false })).toBe(false);
  });

  it('skips dismissed browsers', () => {
    expect(isTourEligible({ ...base, dismissed: true })).toBe(false);
  });

  it('waits until the conversation is connected', () => {
    expect(isTourEligible({ ...base, ready: false })).toBe(false);
  });
});

describe('visibleTourSteps', () => {
  it('includes coach and lapp on a wide desktop with coaching', () => {
    expect(
      visibleTourSteps({ coachEnabled: true, hasLappRail: true }).map((step) => step.id)
    ).toEqual(['partner', 'composer', 'coach', 'lapp']);
  });

  it('omits lapp below xl', () => {
    expect(
      visibleTourSteps({ coachEnabled: true, hasLappRail: false }).map((step) => step.id)
    ).toEqual(['partner', 'composer', 'coach']);
  });

  it('omits coach when the coach is disabled', () => {
    expect(
      visibleTourSteps({ coachEnabled: false, hasLappRail: true }).map((step) => step.id)
    ).toEqual(['partner', 'composer', 'lapp']);
  });
});

describe('shouldAbortTourForViewport', () => {
  it('does not abort a hidden tour on a small screen', () => {
    expect(shouldAbortTourForViewport({ isDesktop: false, phase: 'hidden' })).toBe(false);
  });

  it('aborts an offered or active tour when the viewport drops below lg', () => {
    expect(shouldAbortTourForViewport({ isDesktop: false, phase: 'offer' })).toBe(true);
    expect(shouldAbortTourForViewport({ isDesktop: false, phase: 'active' })).toBe(true);
  });

  it('leaves a desktop tour running', () => {
    expect(shouldAbortTourForViewport({ isDesktop: true, phase: 'offer' })).toBe(false);
  });
});
