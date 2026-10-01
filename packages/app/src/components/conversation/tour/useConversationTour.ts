import { useCallback, useEffect, useRef, useState } from 'react';
import { isTourEligible, shouldAbortTourForViewport, visibleTourSteps } from './tourEligibility';
import { LG_MIN_WIDTH, RAILS_EXPAND_MS, type TourStep, XL_MIN_WIDTH } from './tourSteps';
import { dismissTour, isTourDismissed } from './tourStorage';

export type TourPhase = 'hidden' | 'offer' | 'starting' | 'active';

function matchesMinWidth(px: number): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(`(min-width: ${px}px)`).matches;
}

export function useConversationTour({
  ready,
  isStudySession,
  coachEnabled,
  onKeepRailsOpen,
}: {
  ready: boolean;
  isStudySession: boolean;
  coachEnabled: boolean;
  onKeepRailsOpen: () => void;
}) {
  const [isDesktop, setIsDesktop] = useState(() => matchesMinWidth(LG_MIN_WIDTH));
  const [hasLappRail, setHasLappRail] = useState(() => matchesMinWidth(XL_MIN_WIDTH));
  const [dismissed, setDismissed] = useState(() => isTourDismissed());
  const [phase, setPhase] = useState<TourPhase>('hidden');
  const [stepIndex, setStepIndex] = useState(0);
  const startTimer = useRef<number>(0);

  const eligible = isTourEligible({
    ready,
    isStudySession,
    isDesktop,
    dismissed,
  });
  const steps: TourStep[] = visibleTourSteps({ coachEnabled, hasLappRail });
  const currentStep = steps[stepIndex] ?? steps[0];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const desktopQuery = window.matchMedia(`(min-width: ${LG_MIN_WIDTH}px)`);
    const lappQuery = window.matchMedia(`(min-width: ${XL_MIN_WIDTH}px)`);
    const sync = () => {
      setIsDesktop(desktopQuery.matches);
      setHasLappRail(lappQuery.matches);
    };
    sync();
    desktopQuery.addEventListener('change', sync);
    lappQuery.addEventListener('change', sync);
    return () => {
      desktopQuery.removeEventListener('change', sync);
      lappQuery.removeEventListener('change', sync);
    };
  }, []);

  const markDismissed = useCallback(() => {
    window.clearTimeout(startTimer.current);
    dismissTour();
    setDismissed(true);
    setPhase('hidden');
    setStepIndex(0);
  }, []);

  useEffect(() => {
    if (shouldAbortTourForViewport({ isDesktop, phase })) {
      markDismissed();
    }
  }, [isDesktop, markDismissed, phase]);

  useEffect(() => {
    if (eligible && phase === 'hidden') {
      setPhase('offer');
    }
  }, [eligible, phase]);

  useEffect(() => () => window.clearTimeout(startTimer.current), []);

  const start = useCallback(() => {
    onKeepRailsOpen();
    setStepIndex(0);
    setPhase('starting');
    window.clearTimeout(startTimer.current);
    startTimer.current = window.setTimeout(() => {
      setPhase((current) => (current === 'starting' ? 'active' : current));
    }, RAILS_EXPAND_MS);
  }, [onKeepRailsOpen]);

  useEffect(() => {
    if (stepIndex >= steps.length && steps.length > 0) {
      setStepIndex(steps.length - 1);
    }
  }, [stepIndex, steps.length]);

  const next = useCallback(() => {
    if (stepIndex + 1 >= steps.length) {
      markDismissed();
      return;
    }
    setStepIndex(stepIndex + 1);
  }, [markDismissed, stepIndex, steps.length]);

  return {
    phase,
    steps,
    stepIndex,
    currentStep,
    start,
    next,
    dismiss: markDismissed,
  };
}
