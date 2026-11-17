import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { assertWithinRateLimit, clientAddress, resetIpRateLimits } from './ipRateLimit.js';

describe('clientAddress', () => {
  it('uses the last forwarded hop, which the proxy appended', () => {
    expect(
      clientAddress({
        ip: '10.0.0.1',
        headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.8' },
      })
    ).toBe('203.0.113.8');
  });

  it('falls back to the socket address', () => {
    expect(clientAddress({ ip: '127.0.0.1', headers: {} })).toBe('127.0.0.1');
    expect(clientAddress({})).toBe('unknown');
  });
});

describe('assertWithinRateLimit', () => {
  it('allows the limit and refuses the next call in the same window', () => {
    resetIpRateLimits();
    const now = 1_000;
    assertWithinRateLimit('203.0.113.9', 'feedback', 2, 60_000, now);
    assertWithinRateLimit('203.0.113.9', 'feedback', 2, 60_000, now + 1);
    expect(() => assertWithinRateLimit('203.0.113.9', 'feedback', 2, 60_000, now + 2)).toThrow(
      TRPCError
    );
  });

  it('does not count a different address or a later window', () => {
    resetIpRateLimits();
    assertWithinRateLimit('203.0.113.9', 'elaborate', 1, 1_000, 0);
    expect(() => assertWithinRateLimit('203.0.113.9', 'elaborate', 1, 1_000, 1)).toThrow(
      /Too many requests/
    );
    assertWithinRateLimit('203.0.113.10', 'elaborate', 1, 1_000, 1);
    assertWithinRateLimit('203.0.113.9', 'elaborate', 1, 1_000, 1_000);
  });
});
