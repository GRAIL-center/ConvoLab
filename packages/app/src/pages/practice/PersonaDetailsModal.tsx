import { useEffect, useRef } from 'react';
import type { PracticeScenario } from './PersonaPicker';
import { placeholderCopy } from './placeholderCopy';
import { muted, primaryButton, secondaryButton, serif, soft } from './ui';

type PersonaDetailsModalProps = {
  scenario: PracticeScenario | null;
  tint: string;
  isSelected: boolean;
  onSelect: (scenario: PracticeScenario) => void;
  onClose: () => void;
};

export function PersonaDetailsModal({
  scenario,
  tint,
  isSelected,
  onSelect,
  onClose,
}: PersonaDetailsModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (scenario && !dialog.open) dialog.showModal();
    if (!scenario && dialog.open) dialog.close();
  }, [scenario]);

  const body =
    scenario?.description?.trim() || 'A conversation partner with a clear point of view.';
  const persona = scenario?.partnerPersona?.trim();

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled natively by <dialog>; this click only closes on the backdrop.
    <dialog
      ref={ref}
      aria-labelledby="persona-details-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto w-[min(560px,calc(100vw-2rem))] max-w-none rounded-2xl border border-black/[0.08] bg-[#ffffff] p-0 text-[#1a1916] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.5)] backdrop:bg-[#11110f]/55 backdrop:backdrop-blur-sm open:motion-safe:animate-[practiceDialogIn_220ms_ease-out] dark:border-white/[0.08] dark:bg-[#171612] dark:text-[#f2efe7]"
    >
      {scenario ? (
        <div className="p-7 sm:p-9">
          <div className="flex items-start justify-between gap-4">
            <span
              className={`${serif} flex h-16 w-16 items-center justify-center rounded-full text-[1.6rem] font-medium ${tint}`}
              aria-hidden="true"
            >
              {scenario.name.charAt(0)}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 transition hover:bg-black/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#328278] dark:border-white/15 dark:hover:bg-white/[0.06] dark:focus-visible:ring-[#eeeae1]"
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

          <h2
            id="persona-details-title"
            className={`${serif} mt-6 text-[clamp(1.7rem,4vw,2.2rem)] font-medium leading-tight tracking-[-0.02em]`}
          >
            {scenario.name}
          </h2>
          <p className={`mt-4 text-[1rem] leading-relaxed ${soft}`}>{body}</p>

          {persona && persona !== scenario.description?.trim() ? (
            <div className="mt-6 rounded-2xl bg-black/[0.03] p-5 dark:bg-white/[0.04]">
              <h3 className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${muted}`}>
                Who they are
              </h3>
              <p className={`mt-2 line-clamp-6 text-[0.9rem] leading-relaxed ${soft}`}>{persona}</p>
            </div>
          ) : null}

          <p className={`mt-6 text-[0.9rem] leading-relaxed ${muted}`}>
            {placeholderCopy.practiceGoodFor}
          </p>

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className={secondaryButton}>
              Keep browsing
            </button>
            <button
              type="button"
              onClick={() => {
                onSelect(scenario);
                onClose();
              }}
              className={primaryButton}
            >
              {isSelected ? 'Selected' : 'Select this partner'}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
