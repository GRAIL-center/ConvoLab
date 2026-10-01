import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SpotlightOverlay } from './SpotlightOverlay';
import { useConversationTour } from './useConversationTour';

interface ConversationTourProps {
  ready: boolean;
  isStudySession: boolean;
  coachEnabled: boolean;
  onKeepRailsOpen: () => void;
}

export function ConversationTour({
  ready,
  isStudySession,
  coachEnabled,
  onKeepRailsOpen,
}: ConversationTourProps) {
  const { phase, steps, stepIndex, currentStep, start, next, dismiss } = useConversationTour({
    ready,
    isStudySession,
    coachEnabled,
    onKeepRailsOpen,
  });
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (phase === 'offer') {
      startRef.current?.focus();
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'offer' && phase !== 'starting') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismiss, phase]);

  if (phase === 'hidden' || steps.length === 0) return null;

  if (phase === 'offer') {
    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-tour-offer-title"
        aria-describedby="conversation-tour-offer-body"
        className="fixed bottom-8 right-8 z-40 w-[min(100%-2rem,22rem)] rounded-2xl border border-[#ddd8cc] bg-[#fbfaf6] p-6 text-[#24221d] shadow-[0_18px_48px_rgba(17,17,15,0.18)] dark:border-[#34312c] dark:bg-[#151513] dark:text-[#f2efe7]"
      >
        <h2 id="conversation-tour-offer-title" className="font-serif text-2xl leading-tight">
          First time here?
        </h2>
        <p
          id="conversation-tour-offer-body"
          className="mt-2 text-[15px] leading-relaxed text-[#6f6a61] dark:text-[#9d9890]"
        >
          A 30-second look at the three panels — the partner, a private coach, and how the
          conversation is going.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full px-4 py-2 text-sm text-[#6a655c] transition-colors hover:bg-[#ece8dc] dark:text-[#aaa59b] dark:hover:bg-[#24231f]"
          >
            Skip
          </button>
          <button
            ref={startRef}
            type="button"
            onClick={start}
            className="rounded-full bg-[#24221d] px-5 py-2 text-sm font-medium text-[#f6f5f0] transition-colors hover:bg-[#3a362f] dark:bg-[#eeeae1] dark:text-[#151513] dark:hover:bg-white"
          >
            Show me around
          </button>
        </div>
      </div>,
      document.body
    );
  }

  if (phase === 'starting') {
    return createPortal(
      <div className="fixed inset-0 z-50 bg-[rgba(17,17,15,0.72)]" aria-hidden="true" />,
      document.body
    );
  }

  if (phase === 'active' && currentStep) {
    return (
      <SpotlightOverlay
        step={currentStep}
        stepIndex={stepIndex}
        stepCount={steps.length}
        onNext={next}
        onDismiss={dismiss}
      />
    );
  }

  return null;
}
