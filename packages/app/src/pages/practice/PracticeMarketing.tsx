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

        <section className={section} aria-labelledby="archetypes-title">
          <div className={`${container} text-center`}>
            <Reveal>
              <h2 id="archetypes-title" className={sectionTitle}>
                {placeholderCopy.archetypesLabel}
              </h2>
              <p className={`mx-auto mt-4 max-w-md text-[0.95rem] ${muted}`}>
                {placeholderCopy.archetypesHint}
              </p>
            </Reveal>
            <ul className="mt-12 flex list-none flex-wrap justify-center gap-3 p-0">
              {MARKETING_ARCHETYPES.map((archetype, index) => (
                <li key={archetype.id}>
                  <Reveal delayMs={index * 90}>
                    <div className="rounded-full border border-black/10 bg-[#fffcf7] px-6 py-3.5 dark:border-white/10 dark:bg-[#171612]">
                      <div className={`${serif} text-[1.05rem] font-medium tracking-[-0.01em]`}>
                        {archetype.label}
                      </div>
                      <div className={`mt-0.5 text-[0.75rem] ${muted}`}>{archetype.hint}</div>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>

            <Reveal delayMs={150} className="mt-16 flex flex-col items-center gap-3">
              <button type="button" onClick={onChoosePartner} className={primaryButton}>
                Choose who to practice with
              </button>
              <p className={`text-xs ${muted}`}>
                About ten minutes. You can leave whenever you like.
              </p>
            </Reveal>
          </div>
        </section>

        <Benefits />

        <section className={section} aria-labelledby="lapp-title">
          <div className={container}>
            <Reveal className="mx-auto max-w-4xl text-center">
              <h2
                id="lapp-title"
                className={sectionTitleOneLine}
              >
                {placeholderCopy.lappTitle}
              </h2>
              <p className={`mx-auto mt-5 max-w-2xl text-[1.02rem] leading-relaxed ${soft}`}>
                {placeholderCopy.lappIntro}
              </p>
            </Reveal>
            <ul className="mt-14 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {LAPP.map(([letter, title], index) => (
                <li key={title}>
                  <Reveal delayMs={index * 100} className="h-full">
                    <div className={`${panel} h-full p-7`}>
                      <span className={`${serif} text-[2.6rem] font-medium leading-none ${accent}`}>
                        {letter}
                      </span>
                      <span className="mt-5 block text-[1rem] font-semibold">{title}</span>
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
              Choose who to practice with
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
