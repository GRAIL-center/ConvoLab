/**
 * Seeds ONLY reference data: quota presets and scenarios (which carry the
 * partner and coach system prompts).
 *
 * Use this against any shared environment. The sibling `seed.ts` calls
 * seedDatabase(), which also runs seedTestData() and upserts an
 * admin@example.com user with role ADMIN plus a test invitation — harmless in
 * local development, not something that should ever exist in production.
 *
 * Also note the API only auto-seeds when the database is completely empty
 * (server.ts), so a redeploy does NOT pick up changed prompts. Prompt changes
 * reach a running environment only by running this.
 *
 * Both operations are idempotent upserts keyed by name/slug.
 */
import { createPrismaClient, seedReferenceData } from '../index.js';

const projectId = process.env.FIRESTORE_PROJECT_ID;
if (!projectId) {
  console.error('FIRESTORE_PROJECT_ID is not set. Refusing to guess which project to seed.');
  process.exit(1);
}

const prisma = createPrismaClient({ log: ['error', 'warn'] });

async function main() {
  console.log(`Seeding reference data into project: ${projectId}`);
  await seedReferenceData(prisma);
  console.log('Reference data seeded (quota presets + scenarios).');
}

main()
  .catch((e) => {
    console.error('Error seeding reference data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
