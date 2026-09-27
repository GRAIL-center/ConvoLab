import type { PrismaClient, ReferenceSeedEvent, SeedOptions } from '@workspace/database';

/**
 * Startup seeding: reconcile reference data (scenarios with their prompts,
 * quota presets) on every API start, so a deploy carries prompt changes
 * without anyone remembering to run `seed:reference`.
 *
 * Timing: the server waits up to `waitMs` (default 5 s) for the reconcile
 * before it starts listening. Cloud Run sends traffic to a new revision only
 * once it listens, so in the normal case (an unchanged reconcile is ~14
 * document reads) the new revision's very first request already sees the
 * reconciled prompts. If Firestore is slow the wait ends and the reconcile
 * carries on in the background, so a slow or hung datastore cannot hold the
 * revision past its startup probe. A failure is logged and swallowed: a
 * prompt refresh must never stop the site from serving.
 */

export interface StartupSeedLogger {
  info(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface StartupSeedDeps {
  prisma: PrismaClient;
  log: StartupSeedLogger;
  isDev: boolean;
  env?: NodeJS.ProcessEnv;
  waitMs?: number;
  isDatabaseEmpty: (prisma: PrismaClient) => Promise<boolean>;
  reconcileReferenceData: (prisma: PrismaClient, options: SeedOptions) => Promise<unknown>;
  seedTestData: (prisma: PrismaClient, options: SeedOptions) => Promise<void>;
}

/** 'background' = still running when the wait ended; its result is logged later. */
export type StartupSeedOutcome = 'skipped' | 'completed' | 'failed' | 'background';

export const DEFAULT_STARTUP_SEED_WAIT_MS = 5000;

/** `SEED_REFERENCE_ON_START` defaults to on; `false` (or `0`) turns startup seeding off. */
export function startupSeedingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.SEED_REFERENCE_ON_START?.trim().toLowerCase();
  return !(value === 'false' || value === '0');
}

export async function runStartupSeeding(deps: StartupSeedDeps): Promise<StartupSeedOutcome> {
  const { prisma, log, isDev } = deps;

  if (!startupSeedingEnabled(deps.env ?? process.env)) {
    log.info(
      { event: 'reference_seed_skipped', reason: 'SEED_REFERENCE_ON_START=false' },
      'Startup seeding disabled'
    );
    return 'skipped';
  }

  const seedOptions: SeedOptions = {
    log: (message: string) => log.info({}, message),
    logEvent: (event: ReferenceSeedEvent) => log.info(event, event.event),
  };

  const work = (async (): Promise<StartupSeedOutcome> => {
    // Test data (dev only) is still gated on an empty database, exactly as
    // before. The check must run BEFORE the reconcile, which fills it.
    const wasEmpty = isDev ? await deps.isDatabaseEmpty(prisma) : false;

    try {
      await deps.reconcileReferenceData(prisma, seedOptions);
    } catch (err) {
      log.error(
        { err, event: 'reference_seed_failed' },
        'Reference data reconciliation failed; continuing to serve with the stored data'
      );
      return 'failed';
    }

    if (isDev && wasEmpty) {
      try {
        await deps.seedTestData(prisma, seedOptions);
      } catch (err) {
        log.error({ err }, 'Test data seeding failed; continuing without test data');
      }
    }
    return 'completed';
  })().catch((err): StartupSeedOutcome => {
    log.error({ err, event: 'reference_seed_failed' }, 'Startup seeding failed; continuing');
    return 'failed';
  });

  const waitMs = deps.waitMs ?? DEFAULT_STARTUP_SEED_WAIT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waited = new Promise<StartupSeedOutcome>((resolve) => {
    timer = setTimeout(() => resolve('background'), waitMs);
  });

  const outcome = await Promise.race([work, waited]);
  clearTimeout(timer);
  if (outcome === 'background') {
    log.info(
      { event: 'reference_seed_background', waitMs },
      'Reference reconciliation still running; serving now and letting it finish in the background'
    );
  }
  return outcome;
}

let once: Promise<StartupSeedOutcome> | null = null;

/** Once per process, however many times startup code calls it. */
export function runStartupSeedingOnce(deps: StartupSeedDeps): Promise<StartupSeedOutcome> {
  once ??= runStartupSeeding(deps);
  return once;
}

/** Test hook: forget the memoised run. */
export function resetStartupSeedingForTests(): void {
  once = null;
}
