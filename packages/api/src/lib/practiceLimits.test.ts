import type { Firestore } from '@google-cloud/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeFirestore } from '../__tests__/fakeFirestore.js';
import {
  ACCOUNT_DAILY_LIMIT,
  ACCOUNT_MONTHLY_LIMIT,
  decideAccountStart,
  decideGuestStart,
  GUEST_DAILY_STARTS,
  hashIpForDocId,
  IP_DAILY_NEW_GUEST_STARTS,
  IP_HOURLY_NEW_GUEST_STARTS,
  PRACTICE_LIMIT_MESSAGES,
  releaseGuestPracticeStart,
  reserveAccountPracticeStart,
  reserveGuestPracticeStart,
  utcDayKey,
  utcHourKey,
  utcMonthKey,
} from './practiceLimits.js';

function asFirestore(db: FakeFirestore): Firestore {
  return db as unknown as Firestore;
}

describe('decideAccountStart', () => {
  const now = new Date('2026-11-10T15:00:00.000Z');

  it('allows the 100th conversation of the month', () => {
    expect(
      decideAccountStart({
        monthKey: '2026-11',
        monthCount: ACCOUNT_MONTHLY_LIMIT - 1,
        dayKey: '2026-11-10',
        dayCount: 1,
        now,
      })
    ).toEqual({ kind: 'allow_new' });
  });

  it('refuses the 101st conversation of the month', () => {
    expect(
      decideAccountStart({
        monthKey: '2026-11',
        monthCount: ACCOUNT_MONTHLY_LIMIT,
        dayKey: '2026-11-10',
        dayCount: 1,
        now,
      })
    ).toMatchObject({
      kind: 'refuse',
      reason: 'account_month',
      message: PRACTICE_LIMIT_MESSAGES.accountMonth,
    });
  });

  it('refuses the 9th conversation of the day', () => {
    expect(
      decideAccountStart({
        monthKey: '2026-11',
        monthCount: 8,
        dayKey: '2026-11-10',
        dayCount: ACCOUNT_DAILY_LIMIT,
        now,
      })
    ).toMatchObject({
      kind: 'refuse',
      reason: 'account_day',
      message: PRACTICE_LIMIT_MESSAGES.accountDay,
    });
  });

  it('resets day and month counts when the calendar key changes', () => {
    expect(
      decideAccountStart({
        monthKey: '2026-10',
        monthCount: ACCOUNT_MONTHLY_LIMIT,
        dayKey: '2026-10-31',
        dayCount: ACCOUNT_DAILY_LIMIT,
        now,
      })
    ).toEqual({ kind: 'allow_new' });
  });
});

describe('decideGuestStart', () => {
  it('reopens an existing conversation when allowance remains', () => {
    expect(
      decideGuestStart({
        practiceSessionCount: 1,
        existingSessionId: 'sess-1',
        allowanceRemaining: 1000,
        guestDayStarts: GUEST_DAILY_STARTS,
        ipHourStarts: IP_HOURLY_NEW_GUEST_STARTS,
        ipDayStarts: IP_DAILY_NEW_GUEST_STARTS,
      })
    ).toEqual({ kind: 'reopen', sessionId: 'sess-1' });
  });

  it('allows another conversation when the latest is spent and they still have free slots', () => {
    expect(
      decideGuestStart({
        practiceSessionCount: 1,
        existingSessionId: 'sess-1',
        allowanceRemaining: 0,
        guestDayStarts: 0,
        ipHourStarts: 0,
        ipDayStarts: 0,
      })
    ).toEqual({ kind: 'allow_new' });
  });

  it('asks the guest to sign in after five conversations are spent', () => {
    expect(
      decideGuestStart({
        practiceSessionCount: 5,
        existingSessionId: 'sess-5',
        allowanceRemaining: 0,
        guestDayStarts: 0,
        ipHourStarts: 0,
        ipDayStarts: 0,
      })
    ).toMatchObject({
      kind: 'refuse',
      reason: 'guest_allowance_spent',
      message: PRACTICE_LIMIT_MESSAGES.guestAllowanceSpent,
    });
  });

  it('pauses new guest starts when the site-wide day, IP-hour, or IP-day bucket is full', () => {
    const base = {
      practiceSessionCount: 0,
      existingSessionId: null,
      allowanceRemaining: null,
      guestDayStarts: 0,
      ipHourStarts: 0,
      ipDayStarts: 0,
    };

    expect(decideGuestStart({ ...base, guestDayStarts: GUEST_DAILY_STARTS })).toMatchObject({
      kind: 'refuse',
      reason: 'guest_busy',
    });

    expect(decideGuestStart({ ...base, ipHourStarts: IP_HOURLY_NEW_GUEST_STARTS })).toMatchObject({
      kind: 'refuse',
      reason: 'guest_busy',
    });

    expect(decideGuestStart({ ...base, ipDayStarts: IP_DAILY_NEW_GUEST_STARTS })).toMatchObject({
      kind: 'refuse',
      reason: 'guest_busy',
    });
  });
});

describe('reserve*PracticeStart transactions', () => {
  let db: FakeFirestore;

  beforeEach(() => {
    db = new FakeFirestore();
  });

  it('increments account usage through the 100th start then refuses', async () => {
    const now = new Date('2026-11-10T12:00:00.000Z');
    const firestore = asFirestore(db);

    for (let i = 0; i < ACCOUNT_MONTHLY_LIMIT; i++) {
      // Spread across days so the daily cap does not trip first.
      const day = String((i % 28) + 1).padStart(2, '0');
      const dayNow = new Date(`2026-11-${day}T12:00:00.000Z`);
      const decision = await reserveAccountPracticeStart(firestore, 'user-1', dayNow);
      expect(decision).toEqual({ kind: 'allow_new' });
    }

    const refused = await reserveAccountPracticeStart(firestore, 'user-1', now);
    expect(refused).toMatchObject({ kind: 'refuse', reason: 'account_month' });

    const usage = await db.collection('practiceUsage').doc('user-1').get();
    expect(usage.data()?.monthCount).toBe(ACCOUNT_MONTHLY_LIMIT);
  });

  it('refuses the 9th account start on the same UTC day', async () => {
    const now = new Date('2026-11-10T18:00:00.000Z');
    const firestore = asFirestore(db);

    for (let i = 0; i < ACCOUNT_DAILY_LIMIT; i++) {
      expect(await reserveAccountPracticeStart(firestore, 'user-2', now)).toEqual({
        kind: 'allow_new',
      });
    }
    expect(await reserveAccountPracticeStart(firestore, 'user-2', now)).toMatchObject({
      kind: 'refuse',
      reason: 'account_day',
    });
  });

  it('refuses a new guest start from one IP once the daily per-IP cap is hit', async () => {
    const now = new Date('2026-11-10T15:30:00.000Z');
    const firestore = asFirestore(db);
    const ip = '203.0.113.9';

    for (let i = 0; i < IP_DAILY_NEW_GUEST_STARTS; i++) {
      expect(await reserveGuestPracticeStart(firestore, ip, now)).toEqual({ kind: 'allow_new' });
    }
    expect(await reserveGuestPracticeStart(firestore, ip, now)).toMatchObject({
      kind: 'refuse',
      reason: 'guest_busy',
    });
  });

  it('stores a hashed id with a TTL and never the raw IP', async () => {
    const now = new Date('2026-11-10T15:30:00.000Z');
    const ip = '203.0.113.42';
    await reserveGuestPracticeStart(asFirestore(db), ip, now);

    const hash = hashIpForDocId(ip);
    expect(hash).not.toContain(ip);

    const ipHourDoc = await db
      .collection('practiceIp')
      .doc(`${utcHourKey(now)}__${hash}`)
      .get();
    expect(ipHourDoc.data()?.starts).toBe(1);
    expect(ipHourDoc.data()?.ip).toBeUndefined();
    expect(ipHourDoc.data()?.expireAt).toBeInstanceOf(Date);

    const ipDayDoc = await db
      .collection('practiceIpDay')
      .doc(`${utcDayKey(now)}__${hash}`)
      .get();
    expect(ipDayDoc.data()?.starts).toBe(1);
    expect(ipDayDoc.data()?.ip).toBeUndefined();
  });

  it('still allows a guest from a different IP when one network is paused', async () => {
    const now = new Date('2026-11-10T15:30:00.000Z');
    await db
      .collection('practiceIpDay')
      .doc(`${utcDayKey(now)}__${hashIpForDocId('203.0.113.1')}`)
      .set({ starts: IP_DAILY_NEW_GUEST_STARTS });

    expect(await reserveGuestPracticeStart(asFirestore(db), '203.0.113.2', now)).toEqual({
      kind: 'allow_new',
    });
  });

  it('hands a reserved start back on release so a failed start is not burned', async () => {
    const now = new Date('2026-11-10T15:30:00.000Z');
    const firestore = asFirestore(db);
    const ip = '203.0.113.7';

    await reserveGuestPracticeStart(firestore, ip, now);
    await reserveGuestPracticeStart(firestore, ip, now);
    await releaseGuestPracticeStart(firestore, ip, now);

    const hash = hashIpForDocId(ip);
    const ipDayDoc = await db
      .collection('practiceIpDay')
      .doc(`${utcDayKey(now)}__${hash}`)
      .get();
    expect(ipDayDoc.data()?.starts).toBe(1);
    const dayDoc = await db.collection('guestSpend').doc(utcDayKey(now)).get();
    expect(dayDoc.data()?.starts).toBe(1);
  });

  it('never drives a counter below zero on release', async () => {
    const now = new Date('2026-11-10T15:30:00.000Z');
    const firestore = asFirestore(db);
    await releaseGuestPracticeStart(firestore, '203.0.113.8', now);
    const dayDoc = await db.collection('guestSpend').doc(utcDayKey(now)).get();
    expect(dayDoc.data()?.starts).toBe(0);
  });
});

describe('calendar helpers', () => {
  it('formats UTC keys', () => {
    const now = new Date('2026-11-10T15:04:05.000Z');
    expect(utcDayKey(now)).toBe('2026-11-10');
    expect(utcMonthKey(now)).toBe('2026-11');
    expect(utcHourKey(now)).toBe('2026-11-10T15');
  });
});
