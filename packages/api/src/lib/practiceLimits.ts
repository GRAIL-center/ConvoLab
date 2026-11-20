import { createHash } from 'node:crypto';
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
/**
 * Brand-new guest starts allowed from one network address per UTC day. Lower
 * than hourly * 24 so one address cannot drain the site-wide 50/day on its own
 * in a couple of hours (Hanna, PR #277).
 */
export const IP_DAILY_NEW_GUEST_STARTS = 15;
/** Per-IP guest counters expire after this long; the raw IP is never stored. */
const IP_COUNTER_TTL_MS = 48 * 60 * 60 * 1000;

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

/**
 * The address is hashed before it becomes a Firestore document id, and the raw
 * IP is never stored in the document. Our privacy policy keeps IPs only in the
 * 30-day Cloud logs, so the per-IP counter must not be a second durable copy
 * (Hanna, PR #277). The hash is one-way and good enough to key a counter.
 */
export function hashIpForDocId(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
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
  ipDayStarts: number;
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
    input.ipHourStarts >= IP_HOURLY_NEW_GUEST_STARTS ||
    input.ipDayStarts >= IP_DAILY_NEW_GUEST_STARTS
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
 * ceiling and the per-IP hourly and daily pauses. Returning guests that reopen
 * an existing conversation never call this.
 *
 * The per-IP counters are keyed on a hash of the address and carry an
 * `expireAt` for a Firestore TTL policy; the raw IP is never written (Hanna,
 * PR #277).
 */
export async function reserveGuestPracticeStart(
  db: Firestore,
  ip: string,
  now = new Date()
): Promise<PracticeLimitDecision> {
  const dayKey = utcDayKey(now);
  const hourKey = utcHourKey(now);
  const ipHash = hashIpForDocId(ip);
  const expireAt = new Date(now.getTime() + IP_COUNTER_TTL_MS);
  // Flat doc ids (key__hash) so the in-memory fake and real Firestore both work
  // without a nested collection API.
  const guestRef = db.collection('guestSpend').doc(dayKey);
  const ipHourRef = db.collection('practiceIp').doc(`${hourKey}__${ipHash}`);
  const ipDayRef = db.collection('practiceIpDay').doc(`${dayKey}__${ipHash}`);

  return db.runTransaction(async (tx) => {
    const [guestSnap, ipHourSnap, ipDaySnap] = await Promise.all([
      tx.get(guestRef),
      tx.get(ipHourRef),
      tx.get(ipDayRef),
    ]);
    const guestDayStarts = readStarts((guestSnap.exists ? guestSnap.data() : {}) as CounterDoc);
    const ipHourStarts = readStarts((ipHourSnap.exists ? ipHourSnap.data() : {}) as CounterDoc);
    const ipDayStarts = readStarts((ipDaySnap.exists ? ipDaySnap.data() : {}) as CounterDoc);

    const decision = decideGuestStart({
      practiceSessionCount: 0,
      existingSessionId: null,
      allowanceRemaining: null,
      guestDayStarts,
      ipHourStarts,
      ipDayStarts,
    });
    if (decision.kind !== 'allow_new') return decision;

    tx.set(guestRef, { starts: guestDayStarts + 1, updatedAtMs: now.getTime() });
    tx.set(ipHourRef, { starts: ipHourStarts + 1, updatedAtMs: now.getTime(), expireAt });
    tx.set(ipDayRef, { starts: ipDayStarts + 1, updatedAtMs: now.getTime(), expireAt });
    return { kind: 'allow_new' } as const;
  });
}

/**
 * Hand back a guest start reserved by reserveGuestPracticeStart when the start
 * failed before a session was created, so a crash mid-start does not silently
 * burn one of the five. Decrements the same site-wide and per-IP counters,
 * never below zero.
 */
export async function releaseGuestPracticeStart(
  db: Firestore,
  ip: string,
  now = new Date()
): Promise<void> {
  const dayKey = utcDayKey(now);
  const hourKey = utcHourKey(now);
  const ipHash = hashIpForDocId(ip);
  const guestRef = db.collection('guestSpend').doc(dayKey);
  const ipHourRef = db.collection('practiceIp').doc(`${hourKey}__${ipHash}`);
  const ipDayRef = db.collection('practiceIpDay').doc(`${dayKey}__${ipHash}`);

  await db.runTransaction(async (tx) => {
    const [guestSnap, ipHourSnap, ipDaySnap] = await Promise.all([
      tx.get(guestRef),
      tx.get(ipHourRef),
      tx.get(ipDayRef),
    ]);
    const guestDayStarts = readStarts((guestSnap.exists ? guestSnap.data() : {}) as CounterDoc);
    const ipHourStarts = readStarts((ipHourSnap.exists ? ipHourSnap.data() : {}) as CounterDoc);
    const ipDayStarts = readStarts((ipDaySnap.exists ? ipDaySnap.data() : {}) as CounterDoc);

    tx.set(
      guestRef,
      { starts: Math.max(0, guestDayStarts - 1), updatedAtMs: now.getTime() },
      { merge: true }
    );
    tx.set(
      ipHourRef,
      { starts: Math.max(0, ipHourStarts - 1), updatedAtMs: now.getTime() },
      { merge: true }
    );
    tx.set(
      ipDayRef,
      { starts: Math.max(0, ipDayStarts - 1), updatedAtMs: now.getTime() },
      { merge: true }
    );
  });
}
