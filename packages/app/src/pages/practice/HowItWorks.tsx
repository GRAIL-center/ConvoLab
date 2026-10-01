import { placeholderCopy } from './placeholderCopy';
import { Reveal } from './Reveal';
import { accent, container, muted, section, sectionTitle, serif } from './ui';

export function HowItWorks() {
  return (
    <section id="how" className={section} aria-labelledby="how-title">
      <div className={container}>
        <Reveal>
          <p
            className={`text-center text-[11px] font-medium uppercase tracking-[0.22em] ${accent}`}
          >
            Three steps
          </p>
          <h2 id="how-title" className={`${sectionTitle} mt-3 text-center`}>
            {placeholderCopy.howTitle}
          </h2>
        </Reveal>

        <ol className="relative mt-16 grid list-none gap-12 p-0 md:grid-cols-3 md:gap-8">
          <span
            className="absolute left-[16.5%] right-[16.5%] top-7 hidden h-px bg-gradient-to-r from-transparent via-black/15 to-transparent md:block dark:via-white/15"
            aria-hidden="true"
          />
          {placeholderCopy.howSteps.map((step, index) => (
            <li key={step.title}>
              <Reveal delayMs={index * 120} className="flex flex-col items-center text-center">
                <span
                  className={`${serif} relative flex h-14 w-14 items-center justify-center rounded-full border border-black/10 bg-[#fffcf7] text-[1.4rem] font-medium dark:border-white/10 dark:bg-[#171612] ${accent}`}
                >
                  {index + 1}
                </span>
                <h3 className="mt-6 text-[1.05rem] font-semibold tracking-[-0.01em]">
                  {step.title}
                </h3>
                <p className={`mt-2 max-w-[30ch] text-[0.92rem] leading-relaxed ${muted}`}>
                  {step.body}
                </p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
