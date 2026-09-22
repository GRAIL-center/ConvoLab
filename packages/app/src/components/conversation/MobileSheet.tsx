import { type ReactNode, useEffect, useState } from 'react';

interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * Accessible name for the dialog. Deliberately not rendered: each panel we
   * put in here draws its own heading, and a second visible title would just
   * repeat it.
   */
  label: string;
  children: ReactNode;
}

/**
 * Bottom sheet for the panels that live in the right-hand rails on wide
 * screens. Below those breakpoints the rails collapse to zero width, so
 * without this the coach and the LAPP metrics are simply unreachable.
 *
 * Children are mounted only while the sheet is open. Both panels are also
 * rendered in their (display:none) rails on narrow screens, and mounting a
 * second copy permanently would duplicate the element ids inside the radar
 * SVG and give the coach panel two textareas competing for one ref.
 */
export function MobileSheet({ open, onClose, label, children }: MobileSheetProps) {
  // Enter animation only. Animating the exit means keeping the children
  // mounted past the close, which is exactly what the comment above rules out.
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    // The conversation behind the sheet scrolls on its own. Without this the
    // page scrolls under the sheet whenever a drag starts outside the panel.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close panel"
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          entered ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <dialog
        open
        aria-label={label}
        aria-modal="true"
        className={`relative m-0 flex h-[88dvh] w-full max-w-none flex-col overflow-hidden rounded-t-3xl border-t border-[#ddd8cc] bg-[#fbfaf6] p-0 text-[#24221d] shadow-[0_-8px_40px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-out dark:border-[#2b2925] dark:bg-[#151513] dark:text-[#dedbd4] ${
          entered ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="relative flex shrink-0 items-center justify-center pt-3 pb-1">
          <span className="h-1 w-10 rounded-full bg-[#d8d3c8] dark:bg-[#3a3834]" />
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${label}`}
            className="absolute right-3 top-2 flex h-9 w-9 items-center justify-center rounded-full text-[#5f5a51] transition-colors hover:bg-[#ece8dc] dark:text-[#aaa59b] dark:hover:bg-[#24231f]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 pb-[env(safe-area-inset-bottom)]">{children}</div>
      </dialog>
    </div>
  );
}
