import { AboutSection } from './AboutSection';
import { Benefits } from './Benefits';
import { FaqSection } from './FaqSection';
import { FeatureWhy } from './FeatureWhy';
import { Hero } from './Hero';
import { HowItWorks } from './HowItWorks';
import { PracticeNav } from './PracticeNav';
import { MARKETING_ARCHETYPES, placeholderCopy } from './placeholderCopy';
import { Reveal } from './Reveal';
import {
  accent,
  container,
  muted,
  panel,
  primaryButton,
  secondaryButton,
  section,
  sectionTitle,
  sectionTitleOneLine,
  serif,
  soft,
} from './ui';

const LAPP = [
  ['L', 'Listen'],
  ['A', 'Acknowledge'],
  ['P', 'Pivot'],
  ['P', 'Perspective'],
] as const;

type PracticeMarketingProps = {
  isSignedIn: boolean;
  showPreviewBadge: boolean;
  onChoosePartner: () => void;
};

export function PracticeMarketing({
  isSignedIn,
  showPreviewBadge,
  onChoosePartner,
}: PracticeMarketingProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <PracticeNav isSignedIn={isSignedIn} showPreviewBadge={showPreviewBadge} />
      <main>
        <Hero onChoosePartner={onChoosePartner} />
        <HowItWorks />
        <FeatureWhy />

        <section id="meet" className={section} aria-labelledby="archetypes-title">
          <div className={`${container} text-center`}>
            <Reveal>
              <h2 id="archetypes-title" className={sectionTitle}>
                {placeholderCopy.archetypesLabel}
              </h2>
              <p className={`mx-auto mt-4 max-w-md text-[0.95rem] ${muted}`}>
                {placeholderCopy.archetypesHint}
              </p>
            </Reveal>
            <ul className="mt-10 grid list-none grid-cols-2 gap-3 p-0 sm:mt-12 sm:flex sm:flex-wrap sm:justify-center">
              {MARKETING_ARCHETYPES.map((archetype, index) => (
                <li key={archetype.id}>
                  <Reveal delayMs={index * 90} className="h-full">
                    <div className="h-full rounded-2xl border border-black/10 bg-[#ffffff] px-4 py-3 text-center sm:px-6 sm:py-3.5 dark:border-white/10 dark:bg-[#171612]">
                      <div className={`${serif} text-[1.05rem] font-medium tracking-[-0.01em]`}>
                        {archetype.label}
                      </div>
                      <div className={`mt-0.5 text-[0.75rem] ${muted}`}>{archetype.hint}</div>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>

            <Reveal delayMs={150} className="mt-10 flex flex-col items-center gap-3 sm:mt-16">
              <button type="button" onClick={onChoosePartner} className={primaryButton}>
                {placeholderCopy.ctaLabel}
              </button>
              <p className={`text-xs ${muted}`}>
                About ten minutes. You can leave whenever you like.
              </p>
            </Reveal>
          </div>
        </section>

        <Benefits />

        <section id="lapp" className={section} aria-labelledby="lapp-title">
          <div className={container}>
            <Reveal className="mx-auto max-w-4xl text-center">
              {/* Matches the nav label, as the About section's label does. */}
              <p className={`text-[11px] font-medium uppercase tracking-[0.22em] ${accent}`}>
                The four moves
              </p>
              <h2 id="lapp-title" className={`${sectionTitleOneLine} mt-3`}>
                {placeholderCopy.lappTitle}
              </h2>
              <p className={`mx-auto mt-5 max-w-2xl text-[1.02rem] leading-relaxed ${soft}`}>
                {placeholderCopy.lappIntro}
              </p>
            </Reveal>
            <ul className="mt-10 grid list-none grid-cols-2 gap-3 p-0 sm:mt-14 sm:gap-5 lg:grid-cols-4">
              {LAPP.map(([letter, title], index) => (
                <li key={title}>
                  <Reveal delayMs={index * 100} className="h-full">
                    <div className={`${panel} h-full p-5 sm:p-7`}>
                      <span
                        className={`${serif} text-[2rem] font-medium leading-none sm:text-[2.6rem] ${accent}`}
                      >
                        {letter}
                      </span>
                      <span className="mt-3 block text-[1rem] font-semibold sm:mt-5">{title}</span>
                      <span className={`mt-2 block text-[0.88rem] leading-relaxed ${muted}`}>
                        {placeholderCopy.lappDetails[title]}
                      </span>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <AboutSection />
        <FaqSection />

        <section className="px-6 pb-24 pt-8 text-center sm:px-10">
          <Reveal className="mx-auto max-w-xl">
            <h2 className={sectionTitle}>Ready when you are.</h2>
            <button type="button" onClick={onChoosePartner} className={`${secondaryButton} mt-8`}>
              {placeholderCopy.ctaLabel}
            </button>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-black/[0.08] px-6 py-10 dark:border-white/[0.08] sm:px-10">
        <div
          className={`${container} flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left`}
        >
          <div className="inline-flex items-center gap-2.5">
            <img src="/convolab-logo.svg" alt="" className="h-5 w-5" />
            <span className="text-sm font-semibold">ConvoLab</span>
          </div>
          <p className={`${serif} text-[0.95rem] italic ${muted}`}>{placeholderCopy.purdueLine}</p>
        </div>
      </footer>
    </div>
  );
}
