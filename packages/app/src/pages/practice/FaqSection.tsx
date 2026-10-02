import { placeholderCopy } from './placeholderCopy';
import { Reveal } from './Reveal';
import { muted, section, sectionTitle } from './ui';

export function FaqSection() {
  return (
    <section id="faq" className={section} aria-labelledby="faq-title">
      <div className="mx-auto w-full max-w-3xl">
        <Reveal>
          <h2 id="faq-title" className={`${sectionTitle} text-center`}>
            {placeholderCopy.faqTitle}
          </h2>
        </Reveal>

        <Reveal delayMs={100}>
          <div className="mt-12 divide-y divide-black/[0.08] border-y border-black/[0.08] dark:divide-white/[0.08] dark:border-white/[0.08]">
            {placeholderCopy.faq.map((item) => (
              <details key={item.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-[1.02rem] font-medium focus:outline-none focus-visible:underline [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/10 transition-transform duration-300 group-open:rotate-45 dark:border-white/15"
                    aria-hidden="true"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 12 12"
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <path d="M6 2v8M2 6h8" />
                    </svg>
                  </span>
                </summary>
                <p className={`-mt-1 pb-6 pr-12 text-[0.95rem] leading-relaxed ${muted}`}>
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
