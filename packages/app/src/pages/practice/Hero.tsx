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
        className="pointer-events-none absolute -right-24 top-24 h-[420px] w-[420px] rounded-full bg-[#6f8f89]/[0.12] blur-3xl dark:bg-[#8fb5ae]/[0.08]"
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
          <h1
            className={`${serif} text-[clamp(3.5rem,9vw,6.5rem)] font-medium leading-[0.95] tracking-[-0.045em]`}
          >
            ConvoLab
          </h1>
          <p
            className={`${serif} mx-auto mt-6 max-w-[20ch] text-[clamp(1.5rem,3vw,2.1rem)] leading-[1.18] tracking-[-0.015em] text-balance lg:mx-0`}
          >
            {placeholderCopy.heroHeadline}
          </p>
          <p className={`mx-auto mt-5 max-w-[46ch] text-[1.05rem] leading-relaxed lg:mx-0 ${soft}`}>
            {placeholderCopy.heroSupport}
          </p>
          <div className="mt-9 flex flex-col items-center gap-4 lg:items-start">
            <button type="button" onClick={onChoosePartner} className={primaryButton}>
              Choose who to practice with
            </button>
            <p className={`${serif} text-[1.02rem] italic ${muted}`}>
              {placeholderCopy.purdueLine}
            </p>
          </div>
        </div>

        <div className="flex justify-center [perspective:1400px] lg:justify-end">
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
