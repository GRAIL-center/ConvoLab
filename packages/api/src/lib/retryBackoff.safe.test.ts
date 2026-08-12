import { describe, expect, it } from 'vitest';
import { RETRY_BASE_MS, RETRY_CAP_MS, retryBackoffMs } from './retryBackoff.js';

/**
 * Jitter makes this easy to break silently — a wrong bound still "works", it
 * just retries too eagerly and re-trips the rate limit it was meant to survive.
 * Sample rather than assert a single value.
 */
const SAMPLES = 500;

function sample(retryNumber: number): number[] {
  return Array.from({ length: SAMPLES }, () => retryBackoffMs(retryNumber));
}

describe('retryBackoffMs', () => {
  it('never returns a delay below half the window, so a 429 always gets a real wait', () => {
    for (const retry of [1, 2, 3, 4]) {
      const window = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** retry);
      const min = Math.min(...sample(retry));
      expect(min).toBeGreaterThanOrEqual(Math.floor(window / 2));
    }
  });

  it('never exceeds the window', () => {
    for (const retry of [1, 2, 3, 4]) {
      const window = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** retry);
      expect(Math.max(...sample(retry))).toBeLessThanOrEqual(window);
    }
  });

  it('grows exponentially: each retry waits at least as long as the last', () => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const means = [1, 2, 3].map((r) => mean(sample(r)));
    expect(means[1]).toBeGreaterThan(means[0]);
    expect(means[2]).toBeGreaterThan(means[1]);
  });

  it('is capped, so a retry cannot strand a participant indefinitely', () => {
    expect(Math.max(...sample(20))).toBeLessThanOrEqual(RETRY_CAP_MS);
  });

  it('actually jitters — identical delays would resynchronise sessions', () => {
    expect(new Set(sample(2)).size).toBeGreaterThan(1);
  });
});
