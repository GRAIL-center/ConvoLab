import { Firestore } from '@google-cloud/firestore';

// Initialize Firestore client using env var
const projectId = process.env.FIRESTORE_PROJECT_ID;
if (!projectId) {
  throw new Error('FIRESTORE_PROJECT_ID environment variable is required');
}
const db = new Firestore({ projectId });

/** Helper to get collection reference */
function col(name: string) {
  return db.collection(name);
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
  await ref.set(data);
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
    await ref.set(args.create);
  }
  const finalDoc = await ref.get();
  return { id: finalDoc.id, ...(finalDoc.data() as T) } as T;
}

async function deleteMany(model: string, args?: any): Promise<void> {
  const batch = db.batch();
  const snapshot = await col(model).get();
  snapshot.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}

/** Minimal aggregate mock – returns empty result (can be extended later) */
async function aggregate<T>(model: string, args: any): Promise<any> {
  return { _sum: {}, _count: {} };
}

/** Export a Prisma‑like object with model namespaces */
export const prisma = {
  // ConversationSession model
  conversationSession: {
    findUnique: (args: any) => findUnique<any>('conversationSessions', args),
    findMany: (args?: any) => findMany<any>('conversationSessions', args),
    create: (args: any) => create<any>('conversationSessions', args),
    update: (args: any) => update<any>('conversationSessions', args),
    upsert: (args: any) => upsert<any>('conversationSessions', args),
    deleteMany: (args?: any) => deleteMany('conversationSessions', args),
  },
  // Message model
  message: {
    findUnique: (args: any) => findUnique<any>('messages', args),
    findMany: (args?: any) => findMany<any>('messages', args),
    create: (args: any) => create<any>('messages', args),
    update: (args: any) => update<any>('messages', args),
    upsert: (args: any) => upsert<any>('messages', args),
    deleteMany: (args?: any) => deleteMany('messages', args),
  },
  // LappScore model
  lappScore: {
    findUnique: (args: any) => findUnique<any>('lappScores', args),
    findMany: (args?: any) => findMany<any>('lappScores', args),
    create: (args: any) => create<any>('lappScores', args),
    update: (args: any) => update<any>('lappScores', args),
    upsert: (args: any) => upsert<any>('lappScores', args),
    deleteMany: (args?: any) => deleteMany('lappScores', args),
  },
  // UsageLog model
  usageLog: {
    create: (args: any) => create<any>('usageLogs', args),
    createMany: async (args: any) => {
      const batch = db.batch();
      for (const data of args.data) {
        const ref = col('usageLogs').doc();
        batch.set(ref, data);
      }
      await batch.commit();
    },
    aggregate: (args: any) => aggregate<any>('usageLogs', args),
    deleteMany: (args?: any) => deleteMany('usageLogs', args),
  },
  // User model
  user: {
    findUnique: (args: any) => findUnique<any>('users', args),
    create: (args: any) => create<any>('users', args),
    delete: async (args: any) => {
      await col('users').doc(args.where.id).delete();
    },
    deleteMany: (args?: any) => deleteMany('users', args),
  },
  // Invitation model
  invitation: {
    findUnique: (args: any) => findUnique<any>('invitations', args),
    updateMany: async (args: any) => {
      const batch = db.batch();
      const snap = await col('invitations').get();
      snap.forEach(doc => batch.update(doc.ref, args.data));
      await batch.commit();
    },
    deleteMany: (args?: any) => deleteMany('invitations', args),
    create: (args: any) => create<any>('invitations', args),
    update: (args: any) => update<any>('invitations', args),
  },
  // TelemetryEvent model
  telemetryEvent: {
    create: (args: any) => create<any>('telemetryEvents', args),
  },
  // Additional generic models used in tests – passthrough
  observationNote: { deleteMany: (args?: any) => deleteMany('observationNotes', args) },
  externalIdentity: { deleteMany: (args?: any) => deleteMany('externalIdentities', args) },
  contactMethod: { deleteMany: (args?: any) => deleteMany('contactMethods', args) },
  scenario: { deleteMany: (args?: any) => deleteMany('scenarios', args) },
  quotaPreset: { deleteMany: (args?: any) => deleteMany('quotaPresets', args) },
};

// Export a Prisma‑like type for external typing
export type PrismaClient = typeof prisma;
// No longer re‑exports from @prisma/client
