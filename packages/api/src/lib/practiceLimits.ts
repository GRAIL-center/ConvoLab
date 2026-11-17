import type { Firestore } from '@google-cloud/firestore';

/** New practice conversations a signed-in Google account may start each UTC month. */
export const ACCOUNT_MONTHLY_LIMIT = 100;
/** Soft daily pace for a signed-in account (enough to try every public partner once). */
export const ACCOUNT_DAILY_LIMIT = 8;
/** Free practice conversations a guest cookie may start before signing in. */
export const GUEST_CONVERSATIONS_PER_COOKIE = 5;
/** Brand-new guest starts allowed site-wide per UTC day. */
export const GUEST_DAILY_STARTS = 50;
/** Brand-new guest starts allowed from one network address per UTC hour. */
export const IP_HOURLY_NEW_GUEST_STARTS = 30;

export const PRACTICE_LIMIT_MESSAGES = {
  accountDay: "You've started 8 conversations today. Come back tomorrow.",
  accountMonth: "You've started 100 conversations this month. They reset on the 1st.",
  guestAllowanceSpent: 'Sign in with Google to keep practicing.',
  guestBusy: 'Free practice is busy right now. Try again later, or sign in.',
} as const;

export type PracticeLimitReason =
  | 'account_day'
  | 'account_month'
  | 'guest_allowance_spent'
  | 'guest_busy';

export type PracticeLimitDecision =
  | { kind: 'allow_new' }
  | { kind: 'reopen'; sessionId: string }
  | { kind: 'refuse'; reason: PracticeLimitReason; message: string };

export function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function utcMonthKey(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function utcHourKey(now = new Date()): string {
  return now.toISOString().slice(0, 13);
}

/** Firestore document ids cannot contain `/`; IPv6 uses `:`. */
export function sanitizeIpForDocId(ip: string): string {
  return ip.replace(/[/:]/g, '_').slice(0, 128) || 'unknown';
}

type AccountUsageCounts = {
  monthKey: string;
  monthCount: number;
  dayKey: string;
  dayCount: number;
};

/** Drop stale day/month counters when the UTC calendar key has rolled over. */
export function effectiveAccountCounts(
  counts: AccountUsageCounts,
  now = new Date()
): AccountUsageCounts {
  const monthKey = utcMonthKey(now);
  const dayKey = utcDayKey(now);
  const monthCount = counts.monthKey === monthKey ? counts.monthCount : 0;
  const dayCount = counts.monthKey === monthKey && counts.dayKey === dayKey ? counts.dayCount : 0;
  return { monthKey, dayKey, monthCount, dayCount };
}

export function decideAccountStart(
  counts: AccountUsageCounts & { now?: Date }
): PracticeLimitDecision {
  const { monthCount, dayCount } = effectiveAccountCounts(counts, counts.now ?? new Date());

  if (monthCount >= ACCOUNT_MONTHLY_LIMIT) {
    return {
      kind: 'refuse',
      reason: 'account_month',
      message: PRACTICE_LIMIT_MESSAGES.accountMonth,
    };
  }
  if (dayCount >= ACCOUNT_DAILY_LIMIT) {
    return {
      kind: 'refuse',
      reason: 'account_day',
      message: PRACTICE_LIMIT_MESSAGES.accountDay,
    };
  }
  return { kind: 'allow_new' };
}

export function decideGuestStart(input: {
  /** How many practice sessions this guest cookie already has. */
  practiceSessionCount: number;
  /** Most recent practice session, if any. */
  existingSessionId: string | null;
  allowanceRemaining: number | null;
  guestDayStarts: number;
  ipHourStarts: number;
}): PracticeLimitDecision {
  // Mid-chat Start should reopen the open conversation, not burn another of the five.
  if (
    input.existingSessionId &&
    (input.allowanceRemaining === null || input.allowanceRemaining > 0)
  ) {
    return { kind: 'reopen', sessionId: input.existingSessionId };
  }

  if (input.practiceSessionCount >= GUEST_CONVERSATIONS_PER_COOKIE) {
    return {
      kind: 'refuse',
      reason: 'guest_allowance_spent',
      message: PRACTICE_LIMIT_MESSAGES.guestAllowanceSpent,
    };
  }

  if (
    input.guestDayStarts >= GUEST_DAILY_STARTS ||
    input.ipHourStarts >= IP_HOURLY_NEW_GUEST_STARTS
  ) {
    return {
      kind: 'refuse',
      reason: 'guest_busy',
      message: PRACTICE_LIMIT_MESSAGES.guestBusy,
    };
  }

  return { kind: 'allow_new' };
}

type UsageDoc = {
  monthKey?: string;
  monthCount?: number;
  dayKey?: string;
  dayCount?: number;
};

type CounterDoc = {
  starts?: number;
};

function readAccountUsage(data: UsageDoc): AccountUsageCounts {
  return {
    monthKey: typeof data.monthKey === 'string' ? data.monthKey : '',
    monthCount: typeof data.monthCount === 'number' ? data.monthCount : 0,
    dayKey: typeof data.dayKey === 'string' ? data.dayKey : '',
    dayCount: typeof data.dayCount === 'number' ? data.dayCount : 0,
  };
}

function readStarts(data: CounterDoc): number {
  return typeof data.starts === 'number' ? data.starts : 0;
}

/**
 * Atomically reserve one new practice start for a signed-in account.
 * Throws nothing; returns a refuse decision when the caps are full.
 */
export async function reserveAccountPracticeStart(
  db: Firestore,
  userId: string,
  now = new Date()
): Promise<PracticeLimitDecision> {
  const ref = db.collection('practiceUsage').doc(userId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = readAccountUsage((snap.exists ? snap.data() : {}) as UsageDoc);
    const decision = decideAccountStart({ ...stored, now });
    if (decision.kind !== 'allow_new') return decision;

    const { monthKey, dayKey, monthCount, dayCount } = effectiveAccountCounts(stored, now);
    tx.set(ref, {
      monthKey,
      monthCount: monthCount + 1,
      dayKey,
      dayCount: dayCount + 1,
      updatedAtMs: now.getTime(),
    });
    return { kind: 'allow_new' } as const;
  });
}

/**
 * Atomically reserve one brand-new guest start against the site-wide day
 * ceiling and the per-IP hourly pause. Returning guests that reopen an
 * existing conversation never call this.
 */
export async function reserveGuestPracticeStart(
  db: Firestore,
  ip: string,
  now = new Date()
): Promise<PracticeLimitDecision> {
  const dayKey = utcDayKey(now);
  const hourKey = utcHourKey(now);
  // Flat doc id (hour__ip) so the in-memory fake and real Firestore both work
  // without a nested collection API.
  const guestRef = db.collection('guestSpend').doc(dayKey);
  const ipRef = db.collection('practiceIp').doc(`${hourKey}__${sanitizeIpForDocId(ip)}`);

  return db.runTransaction(async (tx) => {
    const [guestSnap, ipSnap] = await Promise.all([tx.get(guestRef), tx.get(ipRef)]);
    const guestDayStarts = readStarts((guestSnap.exists ? guestSnap.data() : {}) as CounterDoc);
    const ipHourStarts = readStarts((ipSnap.exists ? ipSnap.data() : {}) as CounterDoc);

    const decision = decideGuestStart({
      practiceSessionCount: 0,
      existingSessionId: null,
      allowanceRemaining: null,
      guestDayStarts,
      ipHourStarts,
    });
    if (decision.kind !== 'allow_new') return decision;

    tx.set(guestRef, { starts: guestDayStarts + 1, updatedAtMs: now.getTime() });
    tx.set(ipRef, {
      starts: ipHourStarts + 1,
      hourKey,
      ip,
      updatedAtMs: now.getTime(),
    });
    return { kind: 'allow_new' } as const;
  });
}
