import { useState } from 'react';
import { placeholderCopy, type TeamMember } from './placeholderCopy';
import { Reveal } from './Reveal';
import { TeamBioModal } from './TeamBioModal';
import {
  accent,
  container,
  muted,
  panel,
  section,
  sectionTitle,
  serif,
  soft,
  textLink,
} from './ui';

const cardClass = `${panel} flex flex-col items-start gap-2.5 p-3.5`;

function MemberCardBody({ member, hasBio }: { member: TeamMember; hasBio: boolean }) {
  return (
    <>
      <span
        className={`${serif} flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e7ece9] text-[0.85rem] font-medium text-[#3f5c56] dark:bg-[#243330] dark:text-[#b9d4ce]`}
      >
        {member.initials}
      </span>
      <div className="min-w-0 break-words">
        <div className="text-[0.88rem] font-semibold leading-snug">{member.name}</div>
        <div className={`mt-0.5 text-[0.8rem] leading-snug ${muted}`}>{member.role}</div>
        {hasBio ? (
          <div className={`mt-1.5 text-[0.75rem] font-medium ${accent}`}>Read bio &rarr;</div>
        ) : null}
      </div>
    </>
  );
}

export function AboutSection() {
  const [selected, setSelected] = useState<TeamMember | null>(null);

  return (
    <section id="about" className={section} aria-labelledby="about-title">
      <div className={`${container} grid gap-14 lg:grid-cols-[1fr_1fr] lg:gap-20`}>
        <Reveal>
          <p className={`text-[11px] font-medium uppercase tracking-[0.22em] ${accent}`}>
            {placeholderCopy.aboutTitle}
          </p>
          <h2 id="about-title" className={`${sectionTitle} mt-3`}>
            A research project on talking across difference.
          </h2>
          <p className={`mt-6 text-[1.02rem] leading-relaxed ${soft}`}>
            {placeholderCopy.aboutMission}
          </p>
          <p className={`mt-4 text-[1.02rem] leading-relaxed ${soft}`}>
            {placeholderCopy.aboutMission2}
          </p>
          <p className={`${serif} mt-8 text-[1.02rem] italic ${muted}`}>
            {placeholderCopy.purdueLine}
          </p>
        </Reveal>

        <div className="flex flex-col gap-6">
          <Reveal delayMs={100}>
            <h3 className="text-[0.95rem] font-semibold">{placeholderCopy.teamTitle}</h3>
            <ul className="mt-4 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {placeholderCopy.team.map((member) => {
                const hasBio = Boolean(member.bio?.trim());
                return (
                  <li key={member.name} className="flex">
                    {hasBio ? (
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        onClick={() => setSelected(member)}
                        className={`${cardClass} w-full cursor-pointer text-left transition hover:border-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#171614] dark:hover:border-white/20 dark:focus-visible:ring-[#eeeae1]`}
                      >
                        <MemberCardBody member={member} hasBio />
                      </button>
                    ) : (
                      <div className={`${cardClass} w-full`}>
                        <MemberCardBody member={member} hasBio={false} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Reveal>

          <Reveal delayMs={200}>
            <div className={`${panel} p-6`}>
              <h3 className="text-[0.95rem] font-semibold">{placeholderCopy.contactTitle}</h3>
              <p className={`mt-2 text-[0.92rem] leading-relaxed ${muted}`}>
                {placeholderCopy.contactBody}{' '}
                <a
                  href={`mailto:${placeholderCopy.contactEmail}`}
                  className={`font-medium underline decoration-black/20 underline-offset-4 dark:decoration-white/25 ${accent} ${textLink}`}
                >
                  {placeholderCopy.contactEmail}
                </a>
                .
              </p>
            </div>
          </Reveal>
        </div>
      </div>
      <TeamBioModal member={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
