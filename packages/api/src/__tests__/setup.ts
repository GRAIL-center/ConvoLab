import path from "node:path";
import dotenv from "dotenv";
import { assertSafeFirestoreTestTarget } from './firestoreProductionGuard.js';
import { afterAll, beforeAll, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@workspace/database';
import { FakeFirestore } from './fakeFirestore.js';

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

assertSafeFirestoreTestTarget();

export const fakeDb = new FakeFirestore();

vi.mock('../../../database/src/firestoreClient', () => ({
  getFirestoreClient: () => fakeDb,
}));

vi.mock('../lib/firestore.js', () => ({
  getFirestore: () => fakeDb,
  collection: (name: string) => fakeDb.collection(name),
  createDoc: async () => {
    throw new Error('createDoc not used in tests');
  },
  getDoc: async () => null,
  queryCollection: async () => [],
}));

export let testPrisma: PrismaClient;

/**
 * Clean all collections before each test. Tests run against FakeFirestore, so
 * this never touches Cloud SQL or a live Firestore project.
 */
async function cleanDatabase(prisma: PrismaClient) {
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
  const dbModule = await import('@workspace/database');

  const createPrismaClient = dbModule.createPrismaClient;
  if (!createPrismaClient) {
    throw new Error('createPrismaClient missing from @workspace/database export');
  }
  testPrisma = createPrismaClient();
});

beforeEach(async () => {
  fakeDb.reset();
  await cleanDatabase(testPrisma);
});

afterAll(async () => {
  await testPrisma.$disconnect();
});
