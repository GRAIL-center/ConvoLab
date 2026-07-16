import { Firestore } from '@google-cloud/firestore';
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

async function findMany<T>(model: string, args?: any): Promise<T[]> {
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
  return { id: ref.id, ...(data as any) } as T;
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

async function deleteMany(model: string, args?: any): Promise<void> {
  const batch = getDb().batch();
  const snapshot = await col(model).get();
  snapshot.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}

/** Minimal aggregate mock – returns empty result (can be extended later) */
async function aggregate<T>(model: string, args: any): Promise<any> {
  return { _sum: {}, _count: {} };
}

/** Export a Prisma‑like object with model namespaces */
/* Helper to build a model proxy with common CRUD operations */
function modelProxy<T>(model: string) {
  return {
    findUnique: (args: any) => findUnique<T>(model, args),
    findMany: (args?: any) => findMany<T>(model, args),
    create: (args: any) => create<T>(model, args),
    update: (args: any) => update<T>(model, args),
    upsert: (args: any) => upsert<T>(model, args),
    delete: async (args: any) => {
      await col(model).doc(args.where.id).delete();
    },
    deleteMany: (args?: any) => deleteMany(model, args),
    findFirst: async (args?: any) => {
      const list = await findMany<T>(model, args);
      return list.length > 0 ? list[0] : null;
    },
    count: async (args?: any) => {
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
  conversationSession: modelProxy<any>('conversationSessions'),
  // Message model
  message: modelProxy<any>('messages'),
  // LappScore model
  lappScore: modelProxy<any>('lappScores'),
  // UsageLog model with extra createMany & aggregate
  usageLog: {
    ...modelProxy<any>('usageLogs'),
    createMany: async (args: any) => {
      const batch = getDb().batch();
      for (const data of args.data) {
        const ref = col('usageLogs').doc();
        batch.set(ref, data as WithFieldValue<DocumentData>);
      }
      await batch.commit();
    },
    aggregate: (args: any) => aggregate<any>('usageLogs', args),
  },
  // User model
  user: {
    ...modelProxy<any>('users'),
    delete: async (args: any) => {
      await col('users').doc(args.where.id).delete();
    },
  },
  // Invitation model
  invitation: modelProxy<any>('invitations'),
  // TelemetryEvent model
  telemetryEvent: modelProxy<any>('telemetryEvents'),
  // Additional generic models used in tests – passthrough
  observationNote: modelProxy<any>('observationNotes'),
  externalIdentity: modelProxy<any>('externalIdentities'),
  contactMethod: modelProxy<any>('contactMethods'),
  scenario: modelProxy<any>('scenarios'),
  quotaPreset: modelProxy<any>('quotaPresets'),
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
