import type { ReactNode } from 'react';
import { placeholderCopy } from './placeholderCopy';
import { Reveal } from './Reveal';
import { container, muted, panel, section, sectionTitle, soft } from './ui';

const bubble = 'rounded-2xl px-3.5 py-2 text-[12px] leading-snug shadow-sm';

function PushbackVisual() {
  return (
    <div className="relative h-full w-full">
      <span className="absolute -left-6 -top-6 h-28 w-28 rounded-full bg-[#e9dfd0] dark:bg-[#2a251d]" />
      <span className="absolute bottom-3 right-6 h-10 w-10 rotate-12 rounded-xl border border-black/10 dark:border-white/10" />
      <div className="relative flex h-full flex-col justify-center gap-2.5 px-6">
        <div
          className={`${bubble} max-w-[80%] self-start rounded-bl-md bg-white text-[#2a2824] dark:bg-[#24221d] dark:text-[#e8e4da]`}
        >
          If we don't enforce the border, citizenship means nothing.
        </div>
        <div
          className={`${bubble} max-w-[80%] self-end rounded-br-md bg-[#328278] text-white dark:bg-[#eeeae1] dark:text-[#151513]`}
        >
          What worries you most about that, day to day?
        </div>
        <div
          className={`${bubble} max-w-[80%] self-start rounded-bl-md bg-white text-[#2a2824] dark:bg-[#24221d] dark:text-[#e8e4da]`}
        >
          Wages. I've watched them stay flat for ten years.
        </div>
      </div>
    </div>
  );
}

function CoachVisual() {
  return (
    <div className="relative h-full w-full">
      <span className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[#dde8e5] dark:bg-[#1c2927]" />
      <span className="absolute bottom-5 left-6 h-3 w-3 rounded-full bg-[#86c7c2]/50" />
      <span className="absolute bottom-9 left-11 h-2 w-2 rounded-full bg-[#86c7c2]/30" />
      <div className="relative flex h-full items-center justify-center px-6">
        <div className="w-full max-w-[240px] rounded-2xl border border-[#86c7c2]/30 bg-white/90 p-4 shadow-sm dark:border-[#8fb5ae]/25 dark:bg-[#1b2624]">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4f6f68] dark:text-[#9cc2bb]">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Coach
          </div>
          <p className="mt-2 text-[12px] leading-snug text-[#34463f] dark:text-[#c9ddd8]">
            Before you answer, ask what led them to that view.
          </p>
          <div className="mt-3 flex gap-1.5">
            <span className="h-1.5 w-10 rounded-full bg-[#86c7c2]/50" />
            <span className="h-1.5 w-6 rounded-full bg-[#86c7c2]/25" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SkillVisual() {
  const bars = [38, 56, 48, 72, 64, 86];
  return (
    <div className="relative h-full w-full">
      <span className="absolute -bottom-12 -left-10 h-36 w-36 rounded-full bg-[#e6e1f0] dark:bg-[#221f2b]" />
      <span className="absolute right-6 top-5 h-8 w-8 rounded-full border border-black/10 dark:border-white/10" />
      <div className="relative flex h-full items-end justify-center gap-2.5 px-8 pb-8">
        {bars.map((height, i) => (
          <span
            key={height}
            className="w-5 rounded-t-lg bg-[#171614] dark:bg-[#eeeae1]"
            style={{ height: `${height}%`, opacity: 0.25 + i * 0.13 }}
          />
        ))}
      </div>
    </div>
  );
}

const VISUALS: ReactNode[] = [
  <PushbackVisual key="a" />,
  <CoachVisual key="b" />,
  <SkillVisual key="c" />,
];
const TINTS = [
  'bg-[#f4efe6] dark:bg-[#1d1b16]',
  'bg-[#eef3f1] dark:bg-[#151e1c]',
  'bg-[#f1eff6] dark:bg-[#1a1820]',
];

export function FeatureWhy() {
  return (
    <section className={section} aria-labelledby="why-title">
      <div className={container}>
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 id="why-title" className={sectionTitle}>
            {placeholderCopy.whyTitle}
          </h2>
          <p className={`mt-5 text-[1.05rem] leading-relaxed ${soft}`}>{placeholderCopy.whyBody}</p>
        </Reveal>

        <ul className="mt-10 grid list-none gap-5 p-0 sm:mt-16 sm:gap-6 md:grid-cols-3">
          {placeholderCopy.whyPanels.map((item, index) => (
            <li key={item.title}>
              <Reveal delayMs={index * 120} className="h-full">
                <article
                  className={`${panel} group flex h-full flex-col overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_-28px_rgba(23,22,20,0.35)]`}
                >
                  <div className={`relative h-48 overflow-hidden sm:h-52 ${TINTS[index]}`}>
                    {VISUALS[index]}
                  </div>
                  <div className="flex flex-1 flex-col p-5 sm:p-7">
                    <h3 className="text-[1.1rem] font-semibold tracking-[-0.01em]">{item.title}</h3>
                    <p className={`mt-2 text-[0.92rem] leading-relaxed ${muted}`}>{item.body}</p>
                  </div>
                </article>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
