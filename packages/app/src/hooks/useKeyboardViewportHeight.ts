import { useEffect, useState } from 'react';

/**
 * Height of the part of the screen the on-screen keyboard leaves visible, or
 * null when the layout viewport already fits it.
 *
 * Android Chrome/Brave resize the layout viewport themselves because index.html
 * opts into `interactive-widget=resizes-content`, so `h-dvh` shrinks and this
 * stays null. iOS Safari ignores that flag: it keeps the layout viewport full
 * height and pans the whole page up, pushing the header off screen. There the
 * visual viewport is shorter than the window, and the page sizes itself to it.
 */
export function useKeyboardViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      // Pinch zoom also shrinks the visual viewport; only react to the keyboard.
      if (vv.scale > 1.01) return;
      const covered = window.innerHeight - vv.height;
      setHeight(covered > 80 ? vv.height : null);
      // Undo the pan iOS applied to bring the input into view.
      if (covered > 80) window.scrollTo(0, 0);
    };
    sync();
    vv.addEventListener('resize', sync);
    return () => vv.removeEventListener('resize', sync);
  }, []);

  return height;
}
