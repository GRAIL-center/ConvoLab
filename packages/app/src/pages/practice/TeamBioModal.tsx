import { useEffect, useRef } from 'react';
import { renderBio } from './bioText';
import { MemberAvatar } from './MemberAvatar';
import type { TeamMember } from './placeholderCopy';
import { accent, muted, serif, soft, textLink } from './ui';

type TeamBioModalProps = {
  member: TeamMember | null;
  onClose: () => void;
};

const linkClass = `font-medium underline decoration-black/20 underline-offset-4 dark:decoration-white/25 ${accent} ${textLink}`;

/** Bottom sheet on phones, centered card from `sm` up. */
export function TeamBioModal({ member, onClose }: TeamBioModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (member && !dialog.open) dialog.showModal();
    if (!member && dialog.open) dialog.close();
  }, [member]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled natively by <dialog>; this click only closes on the backdrop.
    <dialog
      ref={ref}
      aria-labelledby="team-bio-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-b-none rounded-t-2xl border border-black/[0.08] bg-[#ffffff] p-0 text-[#1a1916] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.5)] backdrop:bg-[#11110f]/55 backdrop:backdrop-blur-sm open:motion-safe:animate-[practiceDialogIn_220ms_ease-out] sm:m-auto sm:w-[min(520px,calc(100vw-2rem))] sm:rounded-2xl dark:border-white/[0.08] dark:bg-[#171612] dark:text-[#f2efe7]"
    >
      {member ? (
        <div className="p-6 pb-8 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <MemberAvatar member={member} size="lg" />
              <div className="min-w-0">
                <h2
                  id="team-bio-title"
                  className={`${serif} text-[1.5rem] font-medium leading-tight tracking-[-0.02em]`}
                >
                  {member.name}
                </h2>
                <p className={`mt-0.5 text-[0.85rem] leading-snug ${muted}`}>{member.role}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close bio"
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

          <p className={`mt-6 text-[1rem] leading-relaxed ${soft}`}>
            {renderBio(member.bio ?? '', linkClass)}
          </p>

          {member.link ? (
            <a
              href={member.link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-5 inline-block text-[0.92rem] font-medium underline decoration-black/20 underline-offset-4 dark:decoration-white/25 ${accent} ${textLink}`}
            >
              {member.link.label}
            </a>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
