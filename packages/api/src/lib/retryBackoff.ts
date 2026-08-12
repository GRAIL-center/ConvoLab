/**
 * Backoff schedule for LLM retries.
 *
 * Lives in its own module rather than inside ws/conversation.ts so it can be
 * tested without pulling in the WebSocket and Firestore stack.
 */

/** First retry waits ~1-2s, second ~2-4s, third ~4-8s. */
export const RETRY_BASE_MS = 1000;
export const RETRY_CAP_MS = 8000;

/**
 * Equal-jitter exponential backoff.
 *
 * The previous linear delay (1s, 2s) retried every session in near-lockstep,
 * which is the wrong shape for the rate-limit 429s that dominate partner
 * failures at study scale: sessions that fail together retry together and
 * re-trip the limit. Exponential growth backs off faster; the jitter
 * de-synchronises sessions that failed at the same instant.
 *
 * Equal jitter (half fixed, half random) rather than full jitter, because a
 * rate limit needs a guaranteed minimum wait — full jitter can draw a delay
 * near zero and collide again immediately.
 *
 * `retryNumber` is 1-based: callers increment their counter before sleeping.
 */
export function retryBackoffMs(retryNumber: number): number {
  const window = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** retryNumber);
  return Math.round(window / 2 + Math.random() * (window / 2));
}
