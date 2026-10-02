import { type RefObject, useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/**
 * 0 while the element's top sits at the top of the viewport, rising to 1 once
 * the element has scrolled fully out. Under reduced motion it is always 1.
 */
export function useScrollProgress<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  progress: number;
} {
  const ref = useRef<T | null>(null);
  const [progress, setProgress] = useState(() => (prefersReducedMotion() ? 1 : 0));

  useEffect(() => {
    if (prefersReducedMotion()) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const travelled = -rect.top / Math.max(rect.height, 1);
      setProgress(Math.min(1, Math.max(0, travelled)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return { ref, progress };
}
