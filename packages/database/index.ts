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
async function findUnique<T>(
  model: string,
  args: { where: { id: string } }
): Promise<T | null> {
  const doc = await col(model).doc(args.where.id).get();

  return doc.exists
    ? ({ id: doc.id, ...(doc.data() as T) } as T)
    : null;
}

async function findMany<T>(
  model: string,
  _args?: unknown
): Promise<T[]> {
  const snapshot = await col(model).get();

  const results: T[] = [];

  snapshot.forEach((doc) => {
    results.push({
      id: doc.id,
      ...(doc.data() as T),
    } as T);
  });

  return results;
}

async function create<T>(
  model: string,
  args: { data: T & { id?: string } }
): Promise<T & { id: string }> {
  const data = args.data;

  const ref = data.id
    ? col(model).doc(data.id)
    : col(model).doc();

  await ref.set(data as WithFieldValue<DocumentData>);

  return {
    id: ref.id,
    ...data,
  } as T & { id: string };
}

async function update<T>(
  model: string,
  args: {
    where: { id: string };
    data: Partial<T>;
  }
): Promise<T & { id: string }> {
  const ref = col(model).doc(args.where.id);

  await ref.update(args.data as DocumentData);

  const doc = await ref.get();

  return {
    id: doc.id,
    ...(doc.data() as T),
  } as T & { id: string };
}

async function upsert<T extends Record<string, any>>(
  model: string,
  args: {
    where: Record<string, unknown>;
    create: T;
    update: Partial<T>;
  }
): Promise<T & { id: string }> {
  const collection = col(model);

  let ref;

  // Use explicit ID when provided
  if (
    "id" in args.where &&
    typeof args.where.id === "string"
  ) {
    ref = collection.doc(args.where.id);
  } else {
    // Otherwise search by unique fields
    let query: FirebaseFirestore.Query = collection;

    for (const [key, value] of Object.entries(args.where)) {
      query = query.where(key, "==", value);
    }

    const snapshot = await query.limit(1).get();

    ref = snapshot.empty
      ? collection.doc()
      : snapshot.docs[0].ref;
  }

  const doc = await ref.get();

  if (doc.exists) {
    await ref.update(args.update as DocumentData);
  } else {
    await ref.set(
      args.create as WithFieldValue<DocumentData>
    );
  }

  const finalDoc = await ref.get();

  return {
    id: finalDoc.id,
    ...(finalDoc.data() as T),
  } as T & { id: string };
}

async function deleteMany(model: string): Promise<void> {
  const batch = getDb().batch();

  const snapshot = await col(model).get();

  snapshot.forEach((doc) => {
    batch.delete(doc.ref);
  });

  await batch.commit();
}

/** Minimal aggregate mock */
async function aggregate(
  _model: string,
  _args: unknown
): Promise<unknown> {
  return {
    _sum: {},
    _count: {},
  };
}


/**
 * Helper to build Prisma-like model proxy
 */
function modelProxy<T extends Record<string, any>>(model: string) {
  return {
    findUnique: (
      args: { where: { id: string } }
    ) =>
      findUnique<T>(model, args),

    findMany: (
      args?: unknown
    ) =>
      findMany<T>(model, args),

    create: (
      args: { data: T & { id?: string } }
    ) =>
      create<T>(model, args),

    update: (
      args: {
        where: { id: string };
        data: Partial<T>;
      }
    ) =>
      update<T>(model, args),

    upsert: <
      W extends Record<string, unknown>
    >(
      args: {
        where: W;
        create: T;
        update: Partial<T>;
      }
    ) =>
      upsert<T>(model, args),

    delete: async (
      args: { where: { id: string } }
    ) => {
      await col(model)
        .doc(args.where.id)
        .delete();
    },

    deleteMany: () =>
      deleteMany(model),

    findFirst: async (
      args?: unknown
    ) => {
      const list = await findMany<T>(model, args);
      return list.length > 0
        ? list[0]
        : null;
    },

    count: async () => {
      const snapshot = await col(model).get();
      return snapshot.size;
    },
  } as const;
}


/** Roles */
export const Role = {
  GUEST: 'GUEST',
  USER: 'USER',
  STAFF: 'STAFF',
  ADMIN: 'ADMIN',
} as const;

export type Role = keyof typeof Role;


/**
 * Prisma-like object
 *
 * NOTE:
 * Using `any` here intentionally because this shim
 * replaces generated Prisma types.
 */
export const prisma = {
  $disconnect: async () => { },

  conversationSession:
    modelProxy<any>('conversationSessions'),

  message:
    modelProxy<any>('messages'),

  lappScore:
    modelProxy<any>('lappScores'),

  usageLog: {
    ...modelProxy<any>('usageLogs'),

    createMany: async (
      args: unknown
    ) => {
      const batch = getDb().batch();

      const unknownArgs = args as any;

      for (const data of unknownArgs.data) {
        const ref =
          col('usageLogs').doc();

        batch.set(
          ref,
          data as WithFieldValue<DocumentData>
        );
      }

      await batch.commit();
    },

    aggregate: (
      args: unknown
    ) =>
      aggregate('usageLogs', args),
  },

  user: {
    ...modelProxy<any>('users'),

    delete: async (
      args: { where: { id: string } }
    ) => {
      await col('users')
        .doc(args.where.id)
        .delete();
    },
  },

  invitation:
    modelProxy<any>('invitations'),

  telemetryEvent:
    modelProxy<any>('telemetryEvents'),

  observationNote:
    modelProxy<any>('observationNotes'),

  externalIdentity:
    modelProxy<any>('externalIdentities'),

  contactMethod:
    modelProxy<any>('contactMethods'),

  scenario:
    modelProxy<any>('scenarios'),

  quotaPreset:
    modelProxy<any>('quotaPresets'),
};


export type PrismaClient = typeof prisma;


export function createPrismaClient(
  _options?: {
    connectionString?: string;
    log?: string[];
  }
): typeof prisma {
  return prisma;
}