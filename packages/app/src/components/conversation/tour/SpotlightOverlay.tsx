import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isMeasurable, paddedHole, placeTooltip, type Rect } from './spotlightGeometry';
import type { TourStep } from './tourSteps';

const TOOLTIP_WIDTH = 320;
const TOOLTIP_HEIGHT_FALLBACK = 176;

interface SpotlightOverlayProps {
  step: TourStep;
  stepIndex: number;
  stepCount: number;
  onNext: () => void;
  onDismiss: () => void;
}

function readTargetRect(stepId: string): Rect | null {
  const target = document.querySelector<HTMLElement>(`[data-tour="${stepId}"]`);
  if (!target) return null;
  const box = target.getBoundingClientRect();
  const rect = { left: box.left, top: box.top, width: box.width, height: box.height };
  return isMeasurable(rect) ? rect : null;
}

export function SpotlightOverlay({
  step,
  stepIndex,
  stepCount,
  onNext,
  onDismiss,
}: SpotlightOverlayProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const [hole, setHole] = useState<Rect>({
    left: window.innerWidth / 2,
    top: window.innerHeight / 2,
    width: 0,
    height: 0,
  });
  const [tooltipPos, setTooltipPos] = useState({
    left: 24,
    top: window.innerHeight - 220,
  });

  useLayoutEffect(() => {
    const measure = () => {
      const target = readTargetRect(step.id);
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      if (target) {
        setHole(paddedHole(target, viewport));
      }
    };
    const target = document.querySelector(`[data-tour="${step.id}"]`);
    const observer = new ResizeObserver(measure);
    if (target) observer.observe(target);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    // Paint the previous (or zero) hole first so CSS can animate to the new rect.
    const frame = window.requestAnimationFrame(measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step.id]);

  useLayoutEffect(() => {
    const tooltipBox = tooltipRef.current?.getBoundingClientRect();
    const tooltip = {
      width: tooltipBox?.width || TOOLTIP_WIDTH,
      height: tooltipBox?.height || TOOLTIP_HEIGHT_FALLBACK,
    };
    setTooltipPos(
      placeTooltip(hole, tooltip, {
        width: window.innerWidth,
        height: window.innerHeight,
      })
    );
  }, [hole]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: step.id retriggers focus when the region changes
  useEffect(() => {
    nextRef.current?.focus();
  }, [step.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNext();
        return;
      }
      if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        onNext();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        const active = document.activeElement;
        if (event.shiftKey) {
          if (active === skipRef.current) nextRef.current?.focus();
          else skipRef.current?.focus();
        } else if (active === nextRef.current) {
          skipRef.current?.focus();
        } else {
          nextRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss, onNext]);

  const isLast = stepIndex + 1 >= stepCount;
  const labelId = 'conversation-tour-title';
  const descId = 'conversation-tour-body';

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0" aria-hidden="true" />
      <div
        aria-hidden="true"
        className="conversation-tour-hole pointer-events-none absolute rounded-2xl ring-1 ring-[#f6f5f0]/70 dark:ring-[#f2efe7]/35"
        style={{
          left: hole.left,
          top: hole.top,
          width: hole.width,
          height: hole.height,
        }}
      />
      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        aria-describedby={descId}
        className="absolute w-[min(100%-2rem,20rem)] rounded-2xl border border-[#ddd8cc] bg-[#fbfaf6] p-5 text-[#24221d] shadow-[0_18px_48px_rgba(17,17,15,0.28)] dark:border-[#34312c] dark:bg-[#151513] dark:text-[#f2efe7]"
        style={{ left: tooltipPos.left, top: tooltipPos.top }}
      >
        <p className="text-sm text-[#8a857b] dark:text-[#77736b]">
          {stepIndex + 1} of {stepCount}
        </p>
        <h2 id={labelId} className="mt-1 font-serif text-2xl leading-tight">
          {step.title}
        </h2>
        <p
          id={descId}
          className="mt-2 text-[15px] leading-relaxed text-[#6f6a61] dark:text-[#9d9890]"
        >
          {step.body}
        </p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            ref={skipRef}
            type="button"
            onClick={onDismiss}
            className="rounded-full px-2 py-2 text-sm text-[#6a655c] transition-colors hover:text-[#24221d] dark:text-[#aaa59b] dark:hover:text-[#f2efe7]"
          >
            Skip tour
          </button>
          <button
            ref={nextRef}
            type="button"
            onClick={onNext}
            className="rounded-full bg-[#24221d] px-5 py-2 text-sm font-medium text-[#f6f5f0] transition-colors hover:bg-[#3a362f] dark:bg-[#eeeae1] dark:text-[#151513] dark:hover:bg-white"
          >
            {isLast ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
