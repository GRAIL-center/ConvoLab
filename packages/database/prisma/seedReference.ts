/**
 * Seeds ONLY reference data: quota presets and scenarios (which carry the
 * partner and coach system prompts).
 *
 * Use this against any shared environment. The sibling `seed.ts` calls
 * seedDatabase(), which also runs seedTestData() and upserts an
 * admin@example.com user with role ADMIN plus a test invitation — harmless in
 * local development, not something that should ever exist in production.
 *
 * The API runs the same reconcileReferenceData() at every startup (unless
 * SEED_REFERENCE_ON_START=false), so a deploy already carries prompt and
 * scenario changes. This script stays as the manual path: to refresh an
 * environment without a deploy, or to check what a reconcile would log. It
 * calls the identical function, so the two paths cannot diverge.
 *
 * Writes only documents whose contentHash differs from the repo's, keyed by
 * name/slug; never deletes anything.
 *
 * Dry run (reads only, writes nothing, prints what a real run would do):
 *   FIRESTORE_PROJECT_ID=convolab-490517 pnpm -F @workspace/database seed:reference --dry-run
 * or set RECONCILE_DRY_RUN=1. The table lists, per scenario/preset, create /
 * update / unchanged and, for update, which fields differ (names, string
 * lengths and sha256 only; never prompt text).
 */
import { createPrismaClient, formatReconcileReport, reconcileReferenceData } from '../index.js';

const projectId = process.env.FIRESTORE_PROJECT_ID;
if (!projectId) {
  console.error('FIRESTORE_PROJECT_ID is not set. Refusing to guess which project to seed.');
  process.exit(1);
}

const dryRunEnv = process.env.RECONCILE_DRY_RUN?.trim().toLowerCase();
const dryRun =
  process.argv.slice(2).includes('--dry-run') || dryRunEnv === '1' || dryRunEnv === 'true';

const prisma = createPrismaClient({ log: ['error', 'warn'] });

async function main() {
  console.log(
    `${dryRun ? 'DRY RUN: comparing' : 'Reconciling'} reference data in project: ${projectId}`
  );
  const summary = await reconcileReferenceData(prisma, {
    dryRun,
    // The table below says everything; skip the per-document JSON lines.
    logEvent: () => {},
  });
  console.log(formatReconcileReport(summary));
}

main()
  .catch((e) => {
    console.error('Error seeding reference data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
