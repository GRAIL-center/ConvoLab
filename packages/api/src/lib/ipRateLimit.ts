import type { IncomingHttpHeaders } from 'node:http';
import { TRPCError } from '@trpc/server';
import { clientAddress, createFixedWindowLimiter } from './fixedWindowLimiter.js';

/**
 * Rate limits for the unauthenticated public tRPC routes, built on the same
 * fixed-window limiter the native sign-in route uses (#271). Reusing it gives
 * us the IPv6 /64 grouping and the 50,000-key memory cap without a second
 * copy of that logic.
 *
 * Per Cloud Run instance, like the sign-in limiter: a backstop against one
 * address hammering a model-backed route, not an exact quota.
 */
const limiters = {
  // High enough that a shared campus NAT reopening study links is not locked out.
  'study.enter': createFixedWindowLimiter({ max: 120, windowMs: 5 * 60 * 1000 }),
  'feedback.submit': createFixedWindowLimiter({ max: 10, windowMs: 15 * 60 * 1000 }),
  'scenario.elaborate': createFixedWindowLimiter({ max: 8, windowMs: 15 * 60 * 1000 }),
} as const;

export type PublicLimiterName = keyof typeof limiters;

type AddressSource = {
  ip?: string;
  headers?: IncomingHttpHeaders;
};

/** Pull the client address straight from the request the way #271 does. */
export function requestAddress(req: AddressSource): string {
  return clientAddress(req.headers ?? {}, req.ip ?? 'unknown');
}

/**
 * Throw TOO_MANY_REQUESTS when the caller has used up a public route's window.
 * `address` should come from requestAddress / clientAddress so every counter
 * keys on the same value.
 */
export function assertWithinRateLimit(name: PublicLimiterName, address: string): void {
  if (!limiters[name].hit(address).allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Try again shortly.',
    });
  }
}
