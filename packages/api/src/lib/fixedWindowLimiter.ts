/**
 * A small in-memory fixed-window rate limiter (#244).
 *
 * Per instance only: Cloud Run may run several instances, so the real ceiling
 * is `max` times the number of instances. That is enough to stop one address
 * from filling Firestore through an unauthenticated route; it is not meant as
 * an exact quota.
 */
export interface LimitResult {
  allowed: boolean;
  /** Seconds until the current window ends (for a Retry-After header). */
  retryAfterS: number;
}

/**
 * Hard cap on tracked addresses, so a flood of distinct addresses cannot grow
 * memory without bound inside one window. When full, the limiter refuses new
 * addresses until the window rolls over (failing closed for this route only).
 */
export const MAX_TRACKED_KEYS = 50_000;

export function createFixedWindowLimiter(opts: {
  max: number;
  windowMs: number;
  maxKeys?: number;
}) {
  const maxKeys = opts.maxKeys ?? MAX_TRACKED_KEYS;
  const windows = new Map<string, { start: number; count: number }>();
  let lastPrune = 0;

  function prune(now: number) {
    if (now - lastPrune < opts.windowMs) return;
    lastPrune = now;
    for (const [key, w] of windows) {
      if (now - w.start >= opts.windowMs) windows.delete(key);
    }
  }

  return {
    hit(key: string, now = Date.now()): LimitResult {
      prune(now);
      let w = windows.get(key);
      if (!w || now - w.start >= opts.windowMs) {
        if (!w && windows.size >= maxKeys) {
          return { allowed: false, retryAfterS: Math.max(1, Math.ceil(opts.windowMs / 1000)) };
        }
        w = { start: now, count: 0 };
        windows.set(key, w);
      }
      w.count += 1;
      const retryAfterS = Math.max(1, Math.ceil((w.start + opts.windowMs - now) / 1000));
      return { allowed: w.count <= opts.max, retryAfterS };
    },
    /** For tests. */
    size: () => windows.size,
  };
}

/**
 * The address to rate-limit by. Cloud Run sits behind Google's front end,
 * which appends the address it saw to X-Forwarded-For, so the last entry is
 * the one a client cannot forge (earlier entries are whatever the client
 * sent). Falls back to the socket address outside Cloud Run.
 */
export function clientAddress(headers: Record<string, unknown>, socketIp: string): string {
  const xff = headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff.join(',') : typeof xff === 'string' ? xff : '';
  const last = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .pop();
  return rateLimitKey(last || socketIp);
}

/**
 * One IPv6 client usually controls a whole /64 network and can use a new
 * address per request, so IPv6 is limited per /64 prefix. IPv4 (including
 * IPv4-mapped IPv6) is limited per address.
 */
export function rateLimitKey(address: string): string {
  const addr = address.trim().toLowerCase();
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return mapped[1];
  if (!addr.includes(':')) return addr;
  const [head, tail = ''] = addr.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missing = 8 - headParts.length - tailParts.length;
  const groups = addr.includes('::')
    ? [...headParts, ...Array(Math.max(0, missing)).fill('0'), ...tailParts]
    : headParts;
  const prefix = groups
    .slice(0, 4)
    .map((g) => (g || '0').replace(/^0+(?=.)/, ''))
    .join(':');
  return `${prefix}::/64`;
}
