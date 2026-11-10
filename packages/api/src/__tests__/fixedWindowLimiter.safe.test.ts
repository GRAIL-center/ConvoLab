import { describe, expect, it } from 'vitest';
import { clientAddress, createFixedWindowLimiter } from '../lib/fixedWindowLimiter.js';

describe('fixed-window limiter (#244)', () => {
  it('allows up to max per window, then refuses with a Retry-After', () => {
    const limiter = createFixedWindowLimiter({ max: 3, windowMs: 60_000 });
    const t = 1_000;
    expect([1, 2, 3].map(() => limiter.hit('a', t).allowed)).toEqual([true, true, true]);
    const refused = limiter.hit('a', t + 10_000);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterS).toBe(50);
  });

  it('counts each address separately', () => {
    const limiter = createFixedWindowLimiter({ max: 1, windowMs: 60_000 });
    expect(limiter.hit('a', 0).allowed).toBe(true);
    expect(limiter.hit('b', 0).allowed).toBe(true);
    expect(limiter.hit('a', 0).allowed).toBe(false);
  });

  it('starts a fresh window once the old one ends, and forgets stale addresses', () => {
    const limiter = createFixedWindowLimiter({ max: 1, windowMs: 60_000 });
    limiter.hit('a', 0);
    limiter.hit('b', 0);
    expect(limiter.hit('a', 60_000).allowed).toBe(true);
    expect(limiter.size()).toBe(1);
  });
});

describe('clientAddress', () => {
  it('uses the last X-Forwarded-For entry, which the client cannot forge', () => {
    expect(clientAddress({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }, '10.0.0.1')).toBe(
      '203.0.113.9'
    );
  });

  it('falls back to the socket address without the header', () => {
    expect(clientAddress({}, '10.0.0.1')).toBe('10.0.0.1');
  });
});
