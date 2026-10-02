import { placeholderCopy } from './placeholderCopy';
import { Reveal } from './Reveal';
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

export function AboutSection() {
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
            <ul className="mt-4 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {placeholderCopy.team.map((member) => (
                <li
                  key={member.role}
                  className={`${panel} flex items-center gap-3.5 p-4 xl:flex-col xl:items-start`}
                >
                  <span
                    className={`${serif} flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e7ece9] text-[0.95rem] font-medium text-[#3f5c56] dark:bg-[#243330] dark:text-[#b9d4ce]`}
                  >
                    {member.initials}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[0.88rem] font-semibold leading-snug">{member.name}</div>
                    <div className={`mt-0.5 text-[0.8rem] ${muted}`}>{member.role}</div>
                  </div>
                </li>
              ))}
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
    </section>
  );
}
