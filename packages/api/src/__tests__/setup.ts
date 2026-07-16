import path from "path";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

import { execSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach } from 'vitest';

// Placeholder for Prisma client; will be set in beforeAll
export let testPrisma: any;

// Test database connection string
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/conversation_coach_test';

/**
 * Clean all tables before each test.
 * Order matters due to foreign key constraints.
 */
async function cleanDatabase(prisma: any) {
  // Delete in order that respects foreign keys
  await prisma.observationNote.deleteMany();
  await prisma.lappScore.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversationSession.deleteMany();
  await prisma.usageLog.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.externalIdentity.deleteMany();
  await prisma.contactMethod.deleteMany();
  await prisma.user.deleteMany();
  await prisma.scenario.deleteMany();
  await prisma.quotaPreset.deleteMany();
}

beforeAll(async () => {
  // Dynamically import the database module after env is loaded
  const dbModule = await import('@workspace/database');

  const createPrismaClient = dbModule.createPrismaClient;
  if (!createPrismaClient) {
    throw new Error('createPrismaClient missing from @workspace/database export');
  }
  testPrisma = createPrismaClient({
    connectionString: TEST_DATABASE_URL,
    log: ['error'],
  });
  // Push schema to test database (skipped in Firestore shim)
  // execSync('pnpm -F @workspace/database exec prisma db push', {
  //   env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  //   stdio: 'pipe',
  // });
});

beforeEach(async () => {
  await cleanDatabase(testPrisma);
});

afterAll(async () => {
  await testPrisma?.$disconnect();
});
