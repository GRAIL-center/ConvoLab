import { useEffect, useState } from 'react';
import { ThemeToggle } from '../../components/ThemeToggle';
import { muted, scrollToSection, textLink } from './ui';

// Each label is the exact heading it scrolls to, listed in page order, so the
// nav never promises a section the reader cannot then find by name.
const LINKS = [
  { id: 'how', label: 'How it works' },
  { id: 'meet', label: 'Who you might meet' },
  { id: 'benefits', label: 'Benefits' },
  { id: 'lapp', label: 'The four moves' },
  { id: 'about', label: 'About' },
  { id: 'faq', label: 'FAQ' },
] as const;

type PracticeNavProps = {
  isSignedIn: boolean;
  showPreviewBadge: boolean;
};

export function PracticeNav({ isSignedIn, showPreviewBadge }: PracticeNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = (id: string) => {
    setMenuOpen(false);
    scrollToSection(id);
  };

  const accountLink = isSignedIn ? (
    <a href="/home" className={`text-sm font-medium ${muted} ${textLink}`}>
      Your sessions
    </a>
  ) : (
    <a href="/api/auth/google?next=%2Fhome" className={`text-sm font-medium ${muted} ${textLink}`}>
      Sign in
    </a>
  );

  return (
    <header
      className={`sticky top-0 z-30 transition-[background-color,border-color,backdrop-filter] duration-300 ${
        scrolled || menuOpen
          ? 'border-b border-black/[0.08] bg-[#f7faf9]/85 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#11110f]/85'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <nav
        className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4 sm:px-10"
        aria-label="Main"
      >
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className={`inline-flex items-center gap-2.5 ${textLink}`}
        >
          <img src="/convolab-logo.svg" alt="" className="h-6 w-6" />
          <span className="text-[1.05rem] font-semibold tracking-[-0.02em]">ConvoLab</span>
        </button>

        <ul className="hidden list-none items-center gap-7 p-0 lg:flex">
          {LINKS.map((link) => (
            <li key={link.id}>
              <a
                href={`#${link.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  go(link.id);
                }}
                className={`whitespace-nowrap text-sm ${muted} ${textLink}`}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-4">
          {showPreviewBadge ? (
            <span
              className={`hidden rounded-md border border-black/10 px-2.5 py-1 text-[11px] sm:inline dark:border-white/10 ${muted}`}
            >
              Preview
            </span>
          ) : null}
          <span className="hidden whitespace-nowrap lg:inline">{accountLink}</span>
          <ThemeToggle />
          <button
            type="button"
            className={`flex h-10 w-10 items-center justify-center rounded-full border border-black/10 lg:hidden dark:border-white/15 ${textLink}`}
            aria-expanded={menuOpen}
            aria-controls="practice-mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg
              viewBox="0 0 20 20"
              className="h-4 w-4"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              {menuOpen ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
            </svg>
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div
          id="practice-mobile-menu"
          className="border-t border-black/[0.08] px-6 pb-6 pt-2 lg:hidden dark:border-white/[0.08]"
        >
          <ul className="flex list-none flex-col gap-1 p-0">
            {LINKS.map((link) => (
              <li key={link.id}>
                <a
                  href={`#${link.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    go(link.id);
                  }}
                  className={`block py-2.5 text-base ${textLink}`}
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li className="pt-2">{accountLink}</li>
          </ul>
        </div>
      ) : null}
    </header>
  );
}
