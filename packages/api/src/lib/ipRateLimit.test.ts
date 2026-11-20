import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { assertWithinRateLimit, requestAddress } from './ipRateLimit.js';

describe('requestAddress', () => {
  it('uses the last forwarded hop, which the proxy appended', () => {
    expect(
      requestAddress({
        ip: '10.0.0.1',
        headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.8' },
      })
    ).toBe('203.0.113.8');
  });

  it('falls back to the socket address', () => {
    expect(requestAddress({ ip: '127.0.0.1', headers: {} })).toBe('127.0.0.1');
    expect(requestAddress({})).toBe('unknown');
  });

  it('groups an IPv6 client by its /64, like the sign-in limiter', () => {
    expect(
      requestAddress({ headers: { 'x-forwarded-for': '2001:db8:1:2:3:4:5:6' }, ip: 'x' })
    ).toBe('2001:db8:1:2::/64');
  });
});

describe('assertWithinRateLimit', () => {
  it('refuses scenario.elaborate after its 8-per-window cap', () => {
    // The limiter keys on the address, so a fresh address isolates this test.
    const addr = `test-elaborate-${Math.random()}`;
    for (let i = 0; i < 8; i++) {
      expect(() => assertWithinRateLimit('scenario.elaborate', addr)).not.toThrow();
    }
    expect(() => assertWithinRateLimit('scenario.elaborate', addr)).toThrow(TRPCError);
  });

  it('counts each route and address separately', () => {
    const addr = `test-feedback-${Math.random()}`;
    const other = `test-feedback-other-${Math.random()}`;
    for (let i = 0; i < 10; i++) assertWithinRateLimit('feedback.submit', addr);
    expect(() => assertWithinRateLimit('feedback.submit', addr)).toThrow(/Too many requests/);
    // A different address, and a different route, are unaffected.
    expect(() => assertWithinRateLimit('feedback.submit', other)).not.toThrow();
    expect(() => assertWithinRateLimit('study.enter', addr)).not.toThrow();
  });
});
