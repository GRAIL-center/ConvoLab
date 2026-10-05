import { useEffect, useState } from 'react';
import { DialogueGraphic } from './DialogueGraphic';
import { PhoneMockup } from './PhoneMockup';
import { placeholderCopy } from './placeholderCopy';
import { muted, primaryButton, scrollToSection, serif, soft, textLink } from './ui';
import { useScrollProgress } from './useScrollProgress';

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

export function Hero({ onChoosePartner }: { onChoosePartner: () => void }) {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Ease so most of the settling happens in the first half of the scroll.
  const t = 1 - (1 - progress) ** 2;
  const phoneTransform = `translateY(${lerp(0, -28, t)}px) rotateY(${lerp(-18, -3, t)}deg) rotateX(${lerp(7, 0, t)}deg) rotateZ(${lerp(-5, 0, t)}deg)`;

  return (
    <section
      ref={ref}
      className="relative -mt-[73px] overflow-hidden px-6 pb-24 pt-[calc(73px+4rem)] sm:px-10 lg:min-h-screen lg:pb-28 lg:pt-[calc(73px+5rem)]"
    >
      <DialogueGraphic className="pointer-events-none absolute inset-0 h-full w-full text-[#1a1916] dark:text-[#f2efe7]" />
      <div
        className="pointer-events-none absolute -right-24 top-24 h-[460px] w-[460px] rounded-full bg-[#86c7c2]/[0.30] blur-3xl dark:bg-[#8fb5ae]/[0.08]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-32 top-[38%] h-[380px] w-[380px] rounded-full bg-[#ceb888]/[0.28] blur-3xl dark:bg-[#ceb888]/[0.07]"
        aria-hidden="true"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10">
        <div
          className={`text-center transition-[opacity,transform] duration-1000 ease-out motion-reduce:transition-none lg:text-left ${
            entered
              ? 'translate-y-0 opacity-100'
              : 'translate-y-4 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100'
          }`}
        >
          {/* The name lives in the nav; the hero leads with the promise (Daniel, 4 Oct 2026). */}
          <span
            className="mx-auto mb-6 block h-[5px] w-16 rounded-full bg-[#ceb888] lg:mx-0"
            aria-hidden="true"
          />
          <h1
            className={`${serif} mx-auto max-w-[16ch] text-[clamp(2.5rem,6vw,4.4rem)] font-medium leading-[1.04] tracking-[-0.03em] text-balance lg:mx-0`}
          >
            {placeholderCopy.heroHeadline}
          </h1>
          <p className={`mx-auto mt-5 max-w-[46ch] text-[1.05rem] leading-relaxed text-balance lg:mx-0 ${soft}`}>
            {placeholderCopy.heroSupport}
          </p>
          <div className="mt-9 flex flex-col items-center gap-4 lg:items-start">
            <button type="button" onClick={onChoosePartner} className={primaryButton}>
              {placeholderCopy.ctaLabel}
            </button>
            <p className={`${serif} text-[1.02rem] italic ${muted}`}>
              {placeholderCopy.purdueLine}
            </p>
          </div>
        </div>

        <div className="hidden justify-center [perspective:1400px] lg:flex lg:justify-end">
          <PhoneMockup style={{ transform: phoneTransform }} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => scrollToSection('how')}
        aria-label="Scroll to how it works"
        className={`absolute bottom-7 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 transition-opacity duration-300 lg:flex ${muted} ${textLink}`}
        style={{
          opacity: Math.max(0, 1 - progress * 6),
          pointerEvents: progress > 0.15 ? 'none' : undefined,
        }}
      >
        <span className="text-[10px] font-medium uppercase tracking-[0.22em]">Scroll</span>
        <span className="block h-9 w-px origin-top bg-current opacity-50 motion-safe:animate-[practiceScrollCue_1.8s_ease-in-out_infinite]" />
      </button>
    </section>
  );
}
