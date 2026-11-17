import type { IncomingHttpHeaders } from 'node:http';
import { TRPCError } from '@trpc/server';

export type AddressRequest = {
  ip?: string;
  headers?: IncomingHttpHeaders;
};

/**
 * Cloud Run appends the address it actually saw. The left-most value is
 * whatever the client sent, so the last hop is the one we can trust when a
 * proxy is in front. With no forwarded header, use the socket address.
 */
export function clientAddress(req: AddressRequest): string {
  const header = req.headers?.['x-forwarded-for'];
  const raw = Array.isArray(header) ? header.join(',') : header;
  if (raw) {
    const hops = raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }
  return req.ip || 'unknown';
}

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function resetIpRateLimits(): void {
  buckets.clear();
}

export const PUBLIC_LIMITS = {
  // High enough that a shared campus NAT reopening study links is not locked out.
  studyEnter: { limit: 120, windowMs: 5 * 60 * 1000 },
  feedback: { limit: 10, windowMs: 15 * 60 * 1000 },
  elaborate: { limit: 8, windowMs: 15 * 60 * 1000 },
} as const;

export function assertWithinRateLimit(
  address: string,
  bucket: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): void {
  const key = `${bucket}:${address}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Try again shortly.',
    });
  }
}
