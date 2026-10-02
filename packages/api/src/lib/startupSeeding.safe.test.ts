import type { PrismaClient } from '@workspace/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetStartupSeedingForTests,
  runStartupSeeding,
  runStartupSeedingOnce,
  type StartupSeedDeps,
  startupSeedingEnabled,
} from './startupSeeding.js';

// Pure orchestration tests: the reconcile itself is covered against the fake
// Firestore in packages/database (reconcileReferenceData.test.ts). Nothing
// here touches a datastore.

function deps(overrides: Partial<StartupSeedDeps> = {}) {
  const log = { info: vi.fn(), error: vi.fn() };
  const base: StartupSeedDeps = {
    prisma: {} as PrismaClient,
    log,
    isDev: false,
    env: {},
    waitMs: 1000,
    isDatabaseEmpty: vi.fn().mockResolvedValue(false),
    reconcileReferenceData: vi.fn().mockResolvedValue({}),
    seedTestData: vi.fn().mockResolvedValue(undefined),
  };
  return { ...base, ...overrides, log: overrides.log ?? log };
}

beforeEach(() => {
  resetStartupSeedingForTests();
});

describe('startupSeedingEnabled', () => {
  it('defaults to on and is turned off only by false or 0', () => {
    expect(startupSeedingEnabled({})).toBe(true);
    expect(startupSeedingEnabled({ SEED_REFERENCE_ON_START: 'true' })).toBe(true);
    expect(startupSeedingEnabled({ SEED_REFERENCE_ON_START: 'false' })).toBe(false);
    expect(startupSeedingEnabled({ SEED_REFERENCE_ON_START: ' FALSE ' })).toBe(false);
    expect(startupSeedingEnabled({ SEED_REFERENCE_ON_START: '0' })).toBe(false);
  });
});

describe('runStartupSeeding', () => {
  it('reconciles reference data on every start, even when the database is not empty', async () => {
    const d = deps();
    await expect(runStartupSeeding(d)).resolves.toBe('completed');
    expect(d.reconcileReferenceData).toHaveBeenCalledTimes(1);
    expect(d.seedTestData).not.toHaveBeenCalled();
  });

  it('skips everything when SEED_REFERENCE_ON_START=false', async () => {
    const d = deps({ env: { SEED_REFERENCE_ON_START: 'false' }, isDev: true });
    await expect(runStartupSeeding(d)).resolves.toBe('skipped');
    expect(d.reconcileReferenceData).not.toHaveBeenCalled();
    expect(d.seedTestData).not.toHaveBeenCalled();
    expect(d.log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'reference_seed_skipped' }),
      expect.any(String)
    );
  });

  it('seeds test data only in dev and only when the database was empty before reconciling', async () => {
    const order: string[] = [];
    const d = deps({
      isDev: true,
      isDatabaseEmpty: vi.fn(async () => {
        order.push('isDatabaseEmpty');
        return true;
      }),
      reconcileReferenceData: vi.fn(async () => {
        order.push('reconcile');
      }),
      seedTestData: vi.fn(async () => {
        order.push('seedTestData');
      }),
    });
    await runStartupSeeding(d);
    expect(order).toEqual(['isDatabaseEmpty', 'reconcile', 'seedTestData']);

    const nonEmpty = deps({ isDev: true });
    await runStartupSeeding(nonEmpty);
    expect(nonEmpty.seedTestData).not.toHaveBeenCalled();

    const prod = deps({ isDev: false, isDatabaseEmpty: vi.fn().mockResolvedValue(true) });
    await runStartupSeeding(prod);
    expect(prod.isDatabaseEmpty).not.toHaveBeenCalled();
    expect(prod.seedTestData).not.toHaveBeenCalled();
  });

  it('logs a failed reconcile at error and resolves instead of throwing', async () => {
    const d = deps({ reconcileReferenceData: vi.fn().mockRejectedValue(new Error('boom')) });
    await expect(runStartupSeeding(d)).resolves.toBe('failed');
    expect(d.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'reference_seed_failed' }),
      expect.any(String)
    );
  });

  it('stops waiting after waitMs and lets a slow reconcile finish in the background', async () => {
    let finish: () => void = () => {};
    const d = deps({
      waitMs: 10,
      reconcileReferenceData: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      ),
    });
    await expect(runStartupSeeding(d)).resolves.toBe('background');
    expect(d.log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'reference_seed_background' }),
      expect.any(String)
    );
    finish();
  });

  it('forwards structured reconcile events to the logger under their event name', async () => {
    const d = deps({
      reconcileReferenceData: vi.fn(async (_prisma, options) => {
        options.logEvent?.({ event: 'reference_seed_unchanged', scenarios: 13, quotaPresets: 4 });
      }),
    });
    await runStartupSeeding(d);
    expect(d.log.info).toHaveBeenCalledWith(
      { event: 'reference_seed_unchanged', scenarios: 13, quotaPresets: 4 },
      'reference_seed_unchanged'
    );
  });
});

describe('runStartupSeedingOnce', () => {
  it('runs the reconcile once per process', async () => {
    const d = deps();
    await runStartupSeedingOnce(d);
    await runStartupSeedingOnce(d);
    expect(d.reconcileReferenceData).toHaveBeenCalledTimes(1);
  });
});
