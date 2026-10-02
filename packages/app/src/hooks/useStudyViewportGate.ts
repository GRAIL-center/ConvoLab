import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTRPC } from '../api/trpc';
import { isStudyViewportTooNarrow } from '../lib/studyViewport';

// Long enough that dragging a window narrow and back does not report twice or
// start a session mid-drag, short enough that a participant who rotates a
// tablet or widens a window sees the page move on without wondering whether it
// is stuck.
const RESIZE_DEBOUNCE_MS = 200;

type StudyViewportGateOptions = {
  /** Which pilot entry page is asking; carried into the block log. */
  route: 'pilot' | 'study';
  pid?: string;
  rid?: string;
};

/**
 * True while this browser window is too narrow for the pilot as registered.
 *
 * The check runs before a session exists, re-runs on a debounced resize, and
 * clears by itself once the window is wide enough, so the caller only has to
 * decide what to render and when to enter. The first block is reported to the
 * API once per page visit, not once per resize: the question during fielding is
 * how many participants hit this, not how many times they dragged a window.
 */
export function useStudyViewportGate({ route, pid, rid }: StudyViewportGateOptions): boolean {
  const trpc = useTRPC();
  const deviceBlocked = useMutation({
    ...trpc.study.deviceBlocked.mutationOptions(),
    onError: () => {
      // Fire and forget. This call only writes a log line, so a participant who
      // is already being turned away must never also see a failure from it.
    },
  });
  const [blocked, setBlocked] = useState(isStudyViewportTooNarrow);

  // Read through refs so the listener is installed once: the identifiers change
  // as the URL is parsed and `mutate` is not referentially stable, and neither
  // is a reason to tear down and re-add a resize listener.
  const reportRef = useRef({ route, pid, rid, report: deviceBlocked.mutate });
  reportRef.current = { route, pid, rid, report: deviceBlocked.mutate };
  const hasReported = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = () => {
      const tooNarrow = isStudyViewportTooNarrow();
      setBlocked(tooNarrow);
      if (!tooNarrow || hasReported.current) return;
      hasReported.current = true;
      const current = reportRef.current;
      current.report({
        pid: current.pid ?? '',
        rid: current.rid,
        width: window.innerWidth,
        height: window.innerHeight,
        route: current.route,
      });
    };

    check();
    const handleResize = () => {
      clearTimeout(timer);
      timer = setTimeout(check, RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return blocked;
}
