import { TOUR_STEPS, type TourStep, type TourStepId } from './tourSteps';

export function isTourEligible({
  ready,
  isStudySession,
  isDesktop,
  dismissed,
}: {
  ready: boolean;
  isStudySession: boolean;
  isDesktop: boolean;
  dismissed: boolean;
}): boolean {
  return ready && !isStudySession && isDesktop && !dismissed;
}

export function visibleTourSteps({
  coachEnabled,
  hasLappRail,
}: {
  coachEnabled: boolean;
  hasLappRail: boolean;
}): TourStep[] {
  const allow = new Set<TourStepId>(['partner', 'composer']);
  if (coachEnabled) allow.add('coach');
  if (hasLappRail) allow.add('lapp');
  return TOUR_STEPS.filter((step) => allow.has(step.id));
}

export function shouldAbortTourForViewport({
  isDesktop,
  phase,
}: {
  isDesktop: boolean;
  phase: 'hidden' | 'offer' | 'starting' | 'active';
}): boolean {
  return !isDesktop && phase !== 'hidden';
}
