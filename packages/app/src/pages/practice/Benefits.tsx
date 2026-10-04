import { placeholderCopy } from './placeholderCopy';
import { Reveal } from './Reveal';
import { container, sectionTitle, serif } from './ui';

export function Benefits() {
  return (
    <section
      id="benefits"
      className="scroll-mt-16 px-6 py-20 sm:px-10 sm:py-24"
      aria-labelledby="benefits-title"
    >
      <div
        className={`${container} relative overflow-hidden rounded-[36px] bg-[#171614] px-7 py-16 text-[#f2efe7] sm:px-14 sm:py-20 dark:bg-[#1d1c18]`}
      >
        <span
          className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#86c7c2]/25 blur-3xl"
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute -bottom-24 left-10 h-60 w-60 rounded-full border border-white/10"
          aria-hidden="true"
        />

        <div className="relative grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <Reveal>
            <h2 id="benefits-title" className={sectionTitle}>
              {placeholderCopy.benefitsTitle}
            </h2>
          </Reveal>

          <ul className="grid list-none gap-x-10 gap-y-10 p-0 sm:grid-cols-2">
            {placeholderCopy.benefits.map((benefit, index) => (
              <li key={benefit.title}>
                <Reveal delayMs={index * 100}>
                  <span className={`${serif} text-[0.95rem] text-[#8fb5ae]`}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="mt-3 h-px w-full bg-white/10" aria-hidden="true" />
                  <h3 className="mt-5 text-[1.05rem] font-semibold tracking-[-0.01em]">
                    {benefit.title}
                  </h3>
                  <p className="mt-2 text-[0.92rem] leading-relaxed text-[#b3ada2]">
                    {benefit.body}
                  </p>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
