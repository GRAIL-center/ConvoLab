import { useState } from 'react';
import Recaptcha from '../../components/Recaptcha';
import { ThemeToggle } from '../../components/ThemeToggle';
import { PersonaDetailsModal } from './PersonaDetailsModal';
import { Reveal } from './Reveal';
import { accent, muted, primaryButton, secondaryButton, serif, textLink } from './ui';

export type PracticeScenario = {
  id: number | string;
  name: string;
  description: string | null;
  partnerPersona: string;
};

const AVATAR_TINTS = [
  'bg-[#e7ece9] text-[#3f5c56] dark:bg-[#243330] dark:text-[#b9d4ce]',
  'bg-[#efe6d8] text-[#6b5638] dark:bg-[#2e271c] dark:text-[#dcc8a6]',
  'bg-[#e8e5f0] text-[#4e4768] dark:bg-[#26232f] dark:text-[#c5bfdc]',
  'bg-[#f0e3df] text-[#74493d] dark:bg-[#2f211d] dark:text-[#e1bcb1]',
];

function shortRole(scenario: PracticeScenario): string {
  const text = scenario.description?.trim() || scenario.partnerPersona?.trim() || '';
  if (text.length <= 90) return text;
  return `${text.slice(0, 87).trimEnd()}…`;
}

type PersonaPickerProps = {
  scenarios: PracticeScenario[];
  selectedScenario: PracticeScenario | null;
  onSelect: (scenario: PracticeScenario) => void;
  onBack: () => void;
  onContinue: () => void;
  canStartLive: boolean;
  showPreviewBadge: boolean;
  listStatus: 'ready' | 'loading' | 'error';
  onRetry: () => void;
  isSignedIn: boolean;
  isPending: boolean;
  isError: boolean;
  primaryCtaLabel: string | null;
  recaptchaSiteKey: string;
  onRecaptchaChange: (token: string | null) => void;
  recaptchaToken: string | null;
};

export function PersonaPicker({
  scenarios,
  selectedScenario,
  onSelect,
  onBack,
  onContinue,
  canStartLive,
  showPreviewBadge,
  listStatus,
  onRetry,
  isSignedIn,
  isPending,
  isError,
  primaryCtaLabel,
  recaptchaSiteKey,
  onRecaptchaChange,
  recaptchaToken,
}: PersonaPickerProps) {
  const [detailsIndex, setDetailsIndex] = useState<number | null>(null);
  const detailsScenario = detailsIndex == null ? null : (scenarios[detailsIndex] ?? null);
  const continueDisabled =
    !selectedScenario || isPending || !canStartLive || (isSignedIn && !recaptchaToken);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute -left-40 top-20 h-[460px] w-[460px] rounded-full bg-[#86c7c2]/[0.1] blur-3xl dark:bg-[#8fb5ae]/[0.06]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-32 bottom-32 h-[380px] w-[380px] rounded-full bg-[#ceb888]/[0.12] blur-3xl dark:bg-[#ceb888]/[0.05]"
        aria-hidden="true"
      />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-6 sm:px-10">
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex items-center gap-2 text-sm ${muted} ${textLink}`}
        >
          <svg
            viewBox="0 0 12 12"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7.5 2.5L4 6l3.5 3.5" />
          </svg>
          Back
        </button>
        <div className="inline-flex items-center gap-2">
          <img src="/convolab-logo.svg" alt="" className="h-5 w-5" />
          <span className="text-sm font-semibold tracking-[-0.02em]">ConvoLab</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="relative mx-auto w-full max-w-6xl flex-1 px-6 pb-40 pt-8 sm:px-10 sm:pt-12">
        <Reveal className="text-center">
          <p className={`text-[11px] font-medium uppercase tracking-[0.22em] ${accent}`}>
            Step one
          </p>
          <h1
            className={`${serif} mt-3 text-[clamp(2.2rem,5vw,3.4rem)] font-medium leading-[1.05] tracking-[-0.03em]`}
          >
            Choose who to practice with
          </h1>
          <p className={`mx-auto mt-4 max-w-lg text-[1rem] leading-relaxed ${muted}`}>
            One partner, one conversation. Open details to get to know someone before you start.
          </p>
        </Reveal>

        {scenarios.length === 0 ? (
          <div
            className="mx-auto mt-14 flex max-w-md flex-col items-center gap-4 text-center"
            aria-live="polite"
          >
            {listStatus === 'loading' ? (
              <p className={`text-[1rem] ${muted}`}>Loading partners…</p>
            ) : (
              <>
                <p className={`text-[1rem] ${muted}`}>
                  We could not load the partners. Check your connection and try again.
                </p>
                <button type="button" onClick={onRetry} className={secondaryButton}>
                  Try again
                </button>
              </>
            )}
          </div>
        ) : null}

        <ul className="mt-14 flex list-none flex-wrap justify-center gap-6 p-0">
          {scenarios.map((scenario, index) => {
            const isSelected = selectedScenario?.id === scenario.id;
            const tint = AVATAR_TINTS[index % AVATAR_TINTS.length];
            return (
              <li
                key={scenario.id}
                className="w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)]"
              >
                <Reveal delayMs={index * 80} className="h-full">
                  <div
                    className={`group relative flex h-full flex-col rounded-[28px] border bg-[#ffffff] transition duration-300 dark:bg-[#171612] ${
                      isSelected
                        ? 'border-[#328278] shadow-[0_24px_48px_-28px_rgba(23,22,20,0.45)] dark:border-[#eeeae1]'
                        : 'border-black/[0.08] hover:-translate-y-1 hover:shadow-[0_24px_48px_-30px_rgba(23,22,20,0.35)] dark:border-white/[0.08]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(scenario)}
                      aria-pressed={isSelected}
                      className="flex flex-1 flex-col items-center rounded-t-[28px] px-7 pb-6 pt-9 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#328278] dark:focus-visible:ring-[#eeeae1]"
                    >
                      <span
                        className={`${serif} flex h-16 w-16 items-center justify-center rounded-full text-[1.6rem] font-medium transition-transform duration-300 group-hover:scale-105 ${tint}`}
                        aria-hidden="true"
                      >
                        {scenario.name.charAt(0)}
                      </span>
                      <span
                        className={`${serif} mt-5 text-[1.3rem] font-medium tracking-[-0.015em]`}
                      >
                        {scenario.name}
                      </span>
                      <span className={`mt-2 text-[0.88rem] leading-relaxed ${muted}`}>
                        {shortRole(scenario)}
                      </span>
                    </button>

                    <div className="flex items-center justify-between border-t border-black/[0.06] px-6 py-3.5 dark:border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => setDetailsIndex(index)}
                        aria-haspopup="dialog"
                        className={`text-[0.85rem] font-medium ${accent} underline-offset-4 hover:underline ${textLink}`}
                      >
                        See details
                      </button>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full border transition ${
                          isSelected
                            ? 'border-[#328278] bg-[#328278] text-white dark:border-[#eeeae1] dark:bg-[#eeeae1] dark:text-[#151513]'
                            : 'border-black/15 text-transparent dark:border-white/20'
                        }`}
                        aria-hidden="true"
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 12 12"
                          className="h-3 w-3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2.5 6.2l2.3 2.3 4.7-5" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>

        {!canStartLive && scenarios.length > 0 ? (
          <p className={`mx-auto mt-10 max-w-md text-center text-xs ${muted}`}>
            {showPreviewBadge
              ? 'Waiting for live partners from the API. If this stays empty, restart Docker so the emulator can seed.'
              : 'Select a partner to continue.'}
          </p>
        ) : null}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-black/[0.08] bg-[#f7faf9]/90 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#11110f]/90">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 py-4 sm:flex-row sm:justify-between sm:px-10">
          <p className={`text-sm ${muted}`} aria-live="polite">
            {selectedScenario ? (
              <>
                Practicing with{' '}
                <span className="font-semibold text-[#1a1916] dark:text-[#f2efe7]">
                  {selectedScenario.name}
                </span>
              </>
            ) : (
              'No partner selected yet'
            )}
          </p>
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
            {selectedScenario && recaptchaSiteKey && isSignedIn ? (
              <Recaptcha onChange={onRecaptchaChange} />
            ) : null}
            {isError ? <p className="text-sm text-[#a36b55]">Couldn’t start. Try again.</p> : null}
            <button
              type="button"
              onClick={onContinue}
              disabled={continueDisabled}
              className={`${primaryButton} min-w-[180px]`}
            >
              {primaryCtaLabel}
            </button>
          </div>
        </div>
      </div>

      <PersonaDetailsModal
        scenario={detailsScenario}
        tint={AVATAR_TINTS[(detailsIndex ?? 0) % AVATAR_TINTS.length]}
        isSelected={detailsScenario != null && selectedScenario?.id === detailsScenario.id}
        onSelect={onSelect}
        onClose={() => setDetailsIndex(null)}
      />
    </div>
  );
}
