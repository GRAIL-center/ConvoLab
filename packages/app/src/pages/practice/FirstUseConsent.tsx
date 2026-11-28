import { useId, useState } from 'react';
import { ThemeToggle } from '../../components/ThemeToggle';
import { consentCopy, PRIVACY_POLICY_URL } from './consentStorage';
import { muted, primaryButton, secondaryButton, serif, soft, textLink } from './ui';

type FirstUseConsentProps = {
  onAccept: () => void;
  onBack: () => void;
};

/**
 * Shown once, before the partner picker, on the website and in the app (#246).
 * Never on the pilot pages (/pilot, /study): those have their own consent.
 */
export function FirstUseConsent({ onAccept, onBack }: FirstUseConsentProps) {
  const [isAdult, setIsAdult] = useState(false);
  const [underage, setUnderage] = useState(false);
  const checkboxId = useId();

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-7 sm:px-10 sm:py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <button type="button" onClick={onBack} className={`text-sm ${muted} ${textLink}`}>
          Back
        </button>
        <div className="inline-flex items-center gap-2">
          <img src="/convolab-logo.svg" alt="" className="h-5 w-5" />
          <span className="text-sm font-semibold tracking-[-0.02em]">ConvoLab</span>
        </div>
        <ThemeToggle />
      </div>

      {underage ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 pb-16 text-center">
          <p className={`${serif} text-[clamp(1.5rem,3.6vw,2rem)] font-medium`}>
            {consentCopy.underageMessage}
          </p>
          <button type="button" onClick={onBack} className={secondaryButton}>
            {consentCopy.underageBack}
          </button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center pb-16">
          <h2 className={`${serif} text-[clamp(1.9rem,4vw,2.6rem)] font-medium tracking-[-0.02em]`}>
            {consentCopy.title}
          </h2>
          <div className={`mt-5 space-y-4 text-[1rem] leading-relaxed ${soft}`}>
            <p>{consentCopy.aiParagraph}</p>
            <p>{consentCopy.topicsParagraph}</p>
            <p>{consentCopy.storageParagraph}</p>
            <p>{consentCopy.sharingParagraph}</p>
            <p>
              <a
                href={PRIVACY_POLICY_URL}
                target="_blank"
                rel="noreferrer"
                className={`font-medium underline underline-offset-4 ${textLink}`}
              >
                {consentCopy.privacyLink}
              </a>
            </p>
          </div>

          <label
            htmlFor={checkboxId}
            className="mt-7 flex cursor-pointer items-center gap-3 rounded-xl border border-black/10 px-4 py-3.5 dark:border-white/15"
          >
            <input
              id={checkboxId}
              type="checkbox"
              checked={isAdult}
              onChange={(e) => setIsAdult(e.target.checked)}
              className="h-5 w-5 accent-[#328278]"
            />
            <span className="font-medium">{consentCopy.ageLabel}</span>
          </label>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse sm:justify-start">
            <button type="button" disabled={!isAdult} onClick={onAccept} className={primaryButton}>
              {consentCopy.continueLabel}
            </button>
            <button type="button" onClick={() => setUnderage(true)} className={secondaryButton}>
              {consentCopy.underageLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
