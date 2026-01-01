import { execSync } from 'node:child_process';
import { createPrismaClient, type PrismaClient } from '@workspace/database';
import { afterAll, beforeAll, beforeEach } from 'vitest';

// Test database connection string
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/conversation_coach_test';

// Create a separate prisma client for tests
export const testPrisma = createPrismaClient({
  connectionString: TEST_DATABASE_URL,
  log: ['error'], // Minimal logging in tests
});

/**
 * Clean all tables before each test.
 * Order matters due to foreign key constraints.
 */
async function cleanDatabase(prisma: PrismaClient) {
  // Delete in order that respects foreign keys
  await prisma.observationNote.deleteMany();
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
  // Push schema to test database (creates tables if they don't exist)
  try {
    execSync('pnpm -F @workspace/database exec prisma db push', {
      env: {
        ...process.env,
        DATABASE_URL: TEST_DATABASE_URL,
      },
      stdio: 'pipe',
    });
  } catch (error) {
    console.error('Failed to push schema to test database. Is the database running?');
    throw error;
  }
});

beforeEach(async () => {
  await cleanDatabase(testPrisma);
});

afterAll(async () => {
  await testPrisma.$disconnect();
});
