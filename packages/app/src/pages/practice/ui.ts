/** Shared class strings so every practice-page section uses the same system. */

export const serif = 'font-[Newsreader,Georgia,serif]';

export const muted = 'text-[#7a756c] dark:text-[#8f8a80]';
export const soft = 'text-[#4a4741] dark:text-[#c8c3b8]';
export const accent = 'text-[#2f5a53] dark:text-[#8fb5ae]';

// Neighbouring sections stack their padding: py-12 gives 96px between sections
// on phones and sm:py-20 gives 160px on larger screens. At py-20 phones had
// 160px of empty space at every boundary.
export const section = 'scroll-mt-24 px-6 py-12 sm:px-10 sm:py-20';
export const container = 'mx-auto w-full max-w-6xl';

export const sectionTitle = `${serif} text-[clamp(1.9rem,3.8vw,2.6rem)] font-medium leading-[1.12] tracking-[-0.02em] text-balance`;

/** For a heading that must stay on one line at every width; the size scales with the viewport. */
export const sectionTitleOneLine = `${serif} whitespace-nowrap text-[clamp(1rem,4.6vw,2.4rem)] font-medium leading-[1.12] tracking-[-0.02em]`;

const focusRing =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#328278] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7faf9] dark:focus-visible:ring-[#eeeae1] dark:focus-visible:ring-offset-[#11110f]';

export const primaryButton = `inline-flex items-center justify-center rounded-xl bg-[#328278] px-7 py-[14px] text-[0.95rem] font-semibold text-white transition hover:-translate-y-px hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 dark:bg-[#eeeae1] dark:text-[#151513] ${focusRing}`;

export const secondaryButton = `inline-flex items-center justify-center rounded-xl border border-black/15 bg-transparent px-7 py-[14px] text-[0.95rem] font-semibold text-[#1a1916] transition hover:border-black/30 hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-[#f2efe7] dark:hover:border-white/30 dark:hover:bg-white/[0.04] ${focusRing}`;

export const textLink = `rounded-sm transition hover:text-[#1a1916] dark:hover:text-[#f2efe7] ${focusRing}`;

export const panel =
  'rounded-2xl border border-[#2f5a53]/[0.14] bg-[#ffffff] dark:border-white/[0.08] dark:bg-[#171612]';

export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}
