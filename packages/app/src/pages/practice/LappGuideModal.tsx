import { useEffect, useRef } from 'react';
import { LAPP_GUIDE } from './lappGuide';
import { accent, muted, serif, soft } from './ui';

type LappGuideModalProps = {
  open: boolean;
  onClose: () => void;
};

/** Same sheet as TeamBioModal: bottom sheet on phones, centered card from `sm` up. */
export function LappGuideModal({ open, onClose }: LappGuideModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled natively by <dialog>; this click only closes on the backdrop.
    <dialog
      ref={ref}
      aria-labelledby="lapp-guide-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-b-none rounded-t-2xl border border-black/[0.08] bg-[#ffffff] p-0 text-[#1a1916] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.5)] backdrop:bg-[#11110f]/55 backdrop:backdrop-blur-sm open:motion-safe:animate-[practiceDialogIn_220ms_ease-out] sm:m-auto sm:max-h-[88dvh] sm:w-[min(640px,calc(100vw-2rem))] sm:rounded-2xl dark:border-white/[0.08] dark:bg-[#171612] dark:text-[#f2efe7]"
    >
      {open ? (
        <div className="p-6 pb-8 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <h2
              id="lapp-guide-title"
              className={`${serif} text-[1.6rem] font-medium leading-tight tracking-[-0.02em]`}
            >
              {LAPP_GUIDE.title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 transition hover:bg-black/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#328278] dark:border-white/15 dark:hover:bg-white/[0.06] dark:focus-visible:ring-[#eeeae1]"
            >
              <svg
                viewBox="0 0 12 12"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
              </svg>
            </button>
          </div>

          <p className={`mt-4 text-[1rem] leading-relaxed ${soft}`}>{LAPP_GUIDE.intro}</p>

          <ol className="mt-6 list-none space-y-6 p-0">
            {LAPP_GUIDE.steps.map((step) => (
              <li key={step.name} className="flex gap-4">
                <span
                  className={`${serif} w-6 shrink-0 text-[1.9rem] font-medium leading-none ${accent}`}
                  aria-hidden="true"
                >
                  {step.letter}
                </span>
                <div className="min-w-0">
                  <h3 className="text-[1rem] font-semibold">
                    {step.name} — {step.heading}
                  </h3>
                  <p className={`mt-1.5 text-[0.95rem] leading-relaxed ${soft}`}>{step.body}</p>
                  {step.examples ? (
                    <ul className={`mt-2 list-none space-y-1 p-0 text-[0.92rem] italic ${muted}`}>
                      {step.examples.map((example) => (
                        <li key={example}>{example}</li>
                      ))}
                    </ul>
                  ) : null}
                  {step.bullets ? (
                    <ul
                      className={`mt-2 list-disc space-y-1 pl-5 text-[0.95rem] leading-relaxed ${soft}`}
                    >
                      {step.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-7 rounded-2xl bg-[#f1e9d4] px-5 py-4 dark:bg-[#1d1c18]">
            <p className="text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-[#7a6431] dark:text-[#8fb5ae]">
              {LAPP_GUIDE.reminderLabel}
            </p>
            <p className="mt-1.5 text-[1rem] font-semibold">{LAPP_GUIDE.reminder}</p>
            <p className={`mt-1 text-[0.92rem] ${soft}`}>{LAPP_GUIDE.reminderNote}</p>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
