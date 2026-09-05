/**
 * The LAPP method, explained.
 *
 * Shared so the signed-out landing page, the signed-in home and the pilot
 * landing page describe the method in the same words. The wording matches
 * PilotLanding.tsx deliberately: a participant who sees one surface and then
 * the other should not have to work out whether they are being told two
 * different things.
 */
const LAPP_STEPS = [
  {
    letter: 'L',
    title: 'Listen',
    body: 'Understand what actually matters to the other person.',
  },
  {
    letter: 'A',
    title: 'Acknowledge',
    body: 'Name something real you can validate before responding.',
  },
  {
    letter: 'P',
    title: 'Pivot',
    body: 'Ask for your turn before making your point.',
  },
  {
    letter: 'P',
    title: 'Perspective',
    body: 'Share your view in first-person terms, not accusations.',
  },
] as const;

export function LappFramework({
  heading = 'The method',
  intro = 'Your goal is not to win the argument. It is to stay engaged through disagreement — and a coach helps you do it, one turn at a time.',
  className = '',
}: {
  heading?: string;
  intro?: string;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-gray-200 bg-white p-6 sm:p-8
                  dark:border-[rgba(255,255,255,0.09)] dark:bg-[rgba(38,38,38,0.6)] ${className}`}
      aria-labelledby="lapp-heading"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400 dark:text-[#6B6B6B]">
        {heading}
      </p>
      <h2
        id="lapp-heading"
        className="mt-3 max-w-2xl text-lg font-semibold leading-7 text-gray-900 dark:text-[#EBEBEB]"
      >
        {intro}
      </h2>

      <dl className="mt-6 grid gap-5 sm:grid-cols-2">
        {LAPP_STEPS.map((step) => (
          <div key={step.title} className="grid grid-cols-[28px_1fr] gap-3">
            <dt aria-hidden="true">
              <span
                className="font-serif text-lg leading-none text-[rgba(90,140,133,1)]
                           dark:text-[rgba(160,200,194,0.9)]"
              >
                {step.letter}
              </span>
              <span className="mt-1 block h-px w-6 bg-gray-200 dark:bg-[rgba(255,255,255,0.12)]" />
            </dt>
            <dd>
              <p className="text-sm font-semibold text-gray-900 dark:text-[#EBEBEB]">
                {step.title}
              </p>
              <p className="mt-0.5 text-sm leading-6 text-gray-500 dark:text-[#A0A0A0]">
                {step.body}
              </p>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
