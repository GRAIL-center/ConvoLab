import type { Firestore, DocumentData, WithFieldValue } from '@google-cloud/firestore';
import { getFirestoreClient } from './src/firestoreClient';
function getDb(): Firestore {
  return getFirestoreClient();
}


/** Helper to get collection reference */
function col(name: string) {
  return getDb().collection(name);
}

/** Generic CRUD operations used by the shim */
async function findUnique<T>(model: string, args: { where: { id: string } }): Promise<T | null> {
  const doc = await col(model).doc(args.where.id).get();
  return doc.exists ? ({ id: doc.id, ...(doc.data() as T) } as T) : null;
}

async function findMany<T>(model: string, _args?: unknown): Promise<T[]> {
  const snapshot = await col(model).get();
  const results: T[] = [];
  snapshot.forEach(doc => {
    results.push({ id: doc.id, ...(doc.data() as T) } as T);
  });
  return results;
}

async function create<T>(model: string, args: { data: T & { id?: string } }): Promise<T> {
  const data = args.data;
  const ref = data.id ? col(model).doc(data.id) : col(model).doc();
  await ref.set(data as WithFieldValue<DocumentData>);
  return Object.assign({ id: ref.id }, data) as T;
}

async function update<T>(model: string, args: { where: { id: string }; data: Partial<T> }): Promise<T> {
  const ref = col(model).doc(args.where.id);
  await ref.update(args.data);
  const doc = await ref.get();
  return { id: doc.id, ...(doc.data() as T) } as T;
}

async function upsert<T>(model: string, args: { where: { id: string }; create: T; update: Partial<T> }): Promise<T> {
  const ref = col(model).doc(args.where.id);
  const doc = await ref.get();
  if (doc.exists) {
    await ref.update(args.update);
  } else {
    await ref.set(args.create as WithFieldValue<DocumentData>);
  }
  const finalDoc = await ref.get();
  return { id: finalDoc.id, ...(finalDoc.data() as T) } as T;
}

async function deleteMany(model: string): Promise<void> {
  const batch = getDb().batch();
  const snapshot = await col(model).get();
  snapshot.forEach(doc => { batch.delete(doc.ref); });
  await batch.commit();
}

/** Minimal aggregate mock – returns empty result (can be extended later) */
async function aggregate(model: string, args: unknown): Promise<unknown> {
  return { _sum: {}, _count: {} };
}

/** Export a Prisma‑like object with model namespaces */
// Helper to build a model proxy with common CRUD operations
function modelProxy<T>(model: string) {
  return {
    // Find a unique record by ID
    findUnique: (args: { where: { id: string } }) => findUnique<T>(model, args),
    // Find many records (optional pagination args, currently unused)
    findMany: (args?: unknown) => findMany<T>(model, args),
    // Create a new record
    create: (args: { data: T & { id?: string } }) => create<T>(model, args),
    // Update an existing record
    update: (args: { where: { id: string }; data: Partial<T> }) => update<T>(model, args),
    // Upsert a record
    upsert: (args: { where: { id: string }; create: T; update: Partial<T> }) => upsert<T>(model, args),
    // Delete a record by ID
    delete: async (args: { where: { id: string } }) => {
      await col(model).doc(args.where.id).delete();
    },
    // Delete many records of the model
    deleteMany: () => deleteMany(model),
    // Find first record (use findMany and return the first if any)
    findFirst: async (args?: unknown) => {
      const list = await findMany<T>(model, args);
      return list.length > 0 ? list[0] : null;
    },
    // Count records in the collection
    count: async (_args?: unknown) => {
      const snapshot = await col(model).get();
      return snapshot.size;
    },
  } as const;
}

/** Export a Prisma‑like object with model namespaces */
export const Role = {
  GUEST: 'GUEST',
  USER: 'USER',
  STAFF: 'STAFF',
  ADMIN: 'ADMIN',
} as const;

export type Role = keyof typeof Role;

export const prisma = {
  $disconnect: async () => {},
  // ConversationSession model
  
  conversationSession: modelProxy<unknown>('conversationSessions'),
  // Message model
  
  message: modelProxy<unknown>('messages'),
  // LappScore model
  
  lappScore: modelProxy<unknown>('lappScores'),
  // UsageLog model with extra createMany & aggregate
  
  usageLog: {
    ...modelProxy<unknown>('usageLogs'),
    createMany: async (args: unknown) => {
      const batch = getDb().batch();
      // biome-ignore lint/suspicious/noExplicitAny: suppress any usage
    const unknownArgs = args as any;
      for (const data of unknownArgs.data) {
        const ref = col('usageLogs').doc();
        batch.set(ref, data as WithFieldValue<DocumentData>);
      }
      await batch.commit();
    },
    
    aggregate: (args: unknown) => aggregate<unknown>('usageLogs', args as unknown),
  },
  // User model
  
  user: {
    ...modelProxy<unknown>('users'),
    // biome-ignore lint/suspicious/noExplicitAny: suppress any usage
    delete: async (args: { where: { id: string } }) => {
      // biome-ignore lint/suspicious/noExplicitAny: suppress any usage
      await col('users').doc(args.where.id).delete();
    },
  },
  // Invitation model
  invitation: modelProxy<unknown>('invitations'),
  // TelemetryEvent model
  telemetryEvent: modelProxy<unknown>('telemetryEvents'),
  // Additional generic models used in tests – passthrough
  observationNote: modelProxy<unknown>('observationNotes'),
  externalIdentity: modelProxy<unknown>('externalIdentities'),
  contactMethod: modelProxy<unknown>('contactMethods'),
  scenario: modelProxy<unknown>('scenarios'),
  quotaPreset: modelProxy<unknown>('quotaPresets'),
};

// Export a Prisma‑like type for external typing
export type PrismaClient = typeof prisma;
// Helper to create a Prisma‑like client for tests
export function createPrismaClient(_options?: { connectionString?: string; log?: string[] }): typeof prisma {
  // In this Firestore shim, the connection string and log options are not used.
  // The function exists to satisfy the API expected by the test setup.
  return prisma;
}
// No longer re‑exports from @prisma/client
