import { FieldValue } from '@google-cloud/firestore';
import type { Firestore, DocumentData, WithFieldValue } from '@google-cloud/firestore';
import { getFirestoreClient } from './src/firestoreClient';

export { getFirestoreClient } from './src/firestoreClient';

function getDb(): Firestore {
  return getFirestoreClient();
}

/** Helper to get collection reference */
function col(name: string) {
  return getDb().collection(name);
}

// ============================================
// QUERY TRANSLATION HELPERS
//
// The shim exposes a Prisma-shaped API, but earlier versions silently
// ignored `where` / `orderBy` / `select` / `distinct` / `count` / `aggregate`
// inputs entirely (returning the whole collection, or a hardcoded stub).
// That caused real bugs: OAuth login threw on a compound-key lookup,
// `usageLog.aggregate()` always reported zero usage (quota enforcement was
// a no-op), and `user.count({ where: { role: 'ADMIN' } })` returned the
// total user count instead of the admin count (the "don't demote the last
// admin" guard never fired).
//
// The functions below translate the subset of the Prisma query API that's
// actually used in this codebase into real Firestore query calls. Anything
// outside that subset (relational `include`, `OR`/`AND`/`NOT` combinators,
// string `contains`, etc.) throws a clear error instead of silently
// returning wrong data — a loud failure here is much safer than a quiet
// one three layers up in a router.
// ============================================

export type WhereClause = Record<string, unknown>;

const OP_TO_FIRESTORE: Record<string, FirebaseFirestore.WhereFilterOp> = {
  equals: '==',
  not: '!=',
  in: 'in',
  notIn: 'not-in',
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Date) &&
    !Array.isArray(value)
  );
}

function applyFieldOps(
  query: FirebaseFirestore.Query,
  field: string,
  ops: Record<string, unknown>
): FirebaseFirestore.Query {
  for (const [op, value] of Object.entries(ops)) {
    const firestoreOp = OP_TO_FIRESTORE[op];
    if (!firestoreOp) {
      throw new Error(
        `Firestore shim: unsupported where operator "${op}" on field "${field}". ` +
          `Supported operators: ${Object.keys(OP_TO_FIRESTORE).join(', ')}.`
      );
    }
    query = query.where(field, firestoreOp, value as FirebaseFirestore.DocumentFieldValue);
  }
  return query;
}

/**
 * Translates a Prisma-style `where` object into chained Firestore `.where()`
 * calls. Supports plain-value equality, the comparison operators above, and
 * Prisma's JSON-path filter shape (`{ path: ['a', 'b'], equals: value }`,
 * used for querying into a Firestore map field via dot notation).
 */
function applyWhere(
  query: FirebaseFirestore.Query,
  where: WhereClause | undefined
): FirebaseFirestore.Query {
  if (!where) return query;

  for (const [field, rawValue] of Object.entries(where)) {
    if (field === 'OR' || field === 'AND') {
      throw new Error(
        `Firestore shim: "${field}" combinators are not supported in \`where\`. ` +
          `Firestore \`where()\` only supports field-level filters — split this into ` +
          `separate queries, or extend applyWhere() if this becomes common.`
      );
    }

    // Simple field-negation, e.g. `NOT: { value: 'x@example.com' }` (used to
    // exclude one row while clearing a "primary" flag on the rest). Maps
    // cleanly onto Firestore's `!=`. Nested/compound NOT shapes (multiple
    // negated fields, or NOT wrapping AND/OR/operator objects) still throw —
    // this only covers the single-field-equality-negation case that's
    // actually used in this codebase.
    if (field === 'NOT') {
      if (!isPlainObject(rawValue)) {
        throw new Error(
          `Firestore shim: "NOT" must be a plain object of field equality checks to negate, ` +
            `e.g. \`NOT: { value: 'x' }\`. Got: ${JSON.stringify(rawValue)}.`
        );
      }
      const notEntries = Object.entries(rawValue as Record<string, unknown>);
      for (const [notField, notValue] of notEntries) {
        if (isPlainObject(notValue)) {
          throw new Error(
            `Firestore shim: "NOT" only supports simple field-equality negation ` +
              `(e.g. \`NOT: { field: value }\`), not nested operators on field "${notField}".`
          );
        }
        query = query.where(notField, '!=', notValue as FirebaseFirestore.DocumentFieldValue);
      }
      continue;
    }

    if (isPlainObject(rawValue) && Array.isArray((rawValue as { path?: unknown }).path)) {
      const { path, ...ops } = rawValue as { path: string[] } & Record<string, unknown>;
      const fieldPath = [field, ...path].join('.');
      query = applyFieldOps(query, fieldPath, ops);
      continue;
    }

    if (isPlainObject(rawValue)) {
      query = applyFieldOps(query, field, rawValue);
      continue;
    }

    query = query.where(field, '==', rawValue as FirebaseFirestore.DocumentFieldValue);
  }

  return query;
}

function applyOrderBy(
  query: FirebaseFirestore.Query,
  orderBy: unknown
): FirebaseFirestore.Query {
  if (!orderBy) return query;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  for (const clause of clauses) {
    if (!isPlainObject(clause)) continue;
    for (const [field, direction] of Object.entries(clause)) {
      query = query.orderBy(field, direction === 'desc' ? 'desc' : 'asc');
    }
  }
  return query;
}

function applySelect<T extends Record<string, any>>(
  row: T,
  select: Record<string, boolean> | undefined
): T {
  if (!select) return row;
  const result: Record<string, unknown> = { id: row.id };
  for (const [field, include] of Object.entries(select)) {
    if (include) result[field] = row[field];
  }
  return result as T;
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => stripUndefined(item)) as T;
  if (value instanceof Date || value === null || typeof value !== 'object') return value;

  const result: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value as Record<string, unknown>)) {
    if (fieldValue !== undefined) result[key] = stripUndefined(fieldValue);
  }
  return result as T;
}

function applyDistinct<T extends Record<string, any>>(
  rows: T[],
  distinct: string[] | undefined
): T[] {
  if (!distinct || distinct.length === 0) return rows;
  const seen = new Set<string>();
  const result: T[] = [];
  for (const row of rows) {
    const key = JSON.stringify(distinct.map((field) => row[field]));
    if (!seen.has(key)) {
      seen.add(key);
      result.push(row);
    }
  }
  return result;
}

/**
 * Firestore document IDs must be strings. Prisma models with `Int @id`
 * (Scenario, ConversationSession, Message, LappScore) pass numeric ids
 * through from Zod-parsed router input; coercing centrally here means call
 * sites don't each need to remember `String(id)`.
 */
function toDocId(id: unknown): string {
  if (id === undefined || id === null) {
    throw new Error('Firestore shim: doc id is required (received undefined/null)');
  }
  return String(id);
}

/**
 * Resolves a non-id unique `where` clause into a query. Handles two shapes:
 *
 * 1. Prisma's compound-unique-key wrapper, e.g.
 *    `{ provider_externalId: { provider, externalId } }` or
 *    `{ type_value: { type, value } }` — exactly one key whose value is a
 *    plain object (and isn't the JSON-path filter shape).
 * 2. Direct scalar field(s) treated as equality, e.g. `{ token: 'abc' }` or
 *    `{ name: 'quick' }` — falls through to `applyWhere`.
 *
 * Shared by `findUnique` (non-id branch) and `upsert` (non-id branch) so
 * they don't diverge on how they interpret the same where-clause shapes.
 */
function resolveUniqueWhereQuery(
  collection: FirebaseFirestore.CollectionReference,
  where: Record<string, unknown>
): FirebaseFirestore.Query {
  const keys = Object.keys(where);
  if (
    keys.length === 1 &&
    isPlainObject(where[keys[0]]) &&
    !Array.isArray((where[keys[0]] as { path?: unknown }).path)
  ) {
    let query: FirebaseFirestore.Query = collection;
    for (const [field, value] of Object.entries(where[keys[0]] as Record<string, unknown>)) {
      query = query.where(field, '==', value as FirebaseFirestore.DocumentFieldValue);
    }
    return query;
  }

  return applyWhere(collection, where);
}

// ============================================
// GENERIC CRUD OPERATIONS
// ============================================

export interface FindManyArgs {
  where?: WhereClause;
  orderBy?: unknown;
  select?: Record<string, boolean>;
  distinct?: string[];
  take?: number;
  include?: unknown;
}

async function findUnique<T>(
  model: string,
  args: { where: Record<string, unknown>; select?: Record<string, boolean> }
): Promise<T | null> {
  const { where, select } = args;

  if ('id' in where && where.id !== undefined && where.id !== null) {
    const doc = await col(model).doc(toDocId(where.id)).get();
    if (!doc.exists) return null;
    const row = { ...(doc.data() as T), id: doc.id } as T;
    return select ? applySelect(row as any, select) : row;
  }

  const keys = Object.keys(where);
  if (keys.length === 0) {
    throw new Error(
      `Firestore shim: unsupported findUnique \`where\` shape for model "${model}": {}. ` +
        `Expected { id }, a single scalar unique field, or a single compound-unique-key object.`
    );
  }

  // Handles both Prisma's compound-unique-key wrapper (e.g.
  // `{ provider_externalId: { provider, externalId } }`) and direct scalar
  // unique fields (e.g. `{ token: 'abc123' }`), sharing logic with `upsert`.
  const query = resolveUniqueWhereQuery(col(model), where);
  const snapshot = await query.limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  const row = { ...(doc.data() as T), id: doc.id } as T;
  return select ? applySelect(row as any, select) : row;
}

async function findMany<T>(model: string, args?: FindManyArgs): Promise<T[]> {
  if (args?.include) {
    throw new Error(
      `Firestore shim: "include" (relational joins) is not supported for model "${model}". ` +
        `Firestore has no joins — fetch related docs explicitly at the call site.`
    );
  }

  let query: FirebaseFirestore.Query = col(model);
  query = applyWhere(query, args?.where);
  query = applyOrderBy(query, args?.orderBy);

  const hasDistinct = !!args?.distinct?.length;
  if (typeof args?.take === 'number' && !hasDistinct) {
    query = query.limit(args.take);
  }

  const snapshot = await query.get();
  let results: T[] = [];
  snapshot.forEach((doc) => {
    results.push({ ...(doc.data() as T), id: doc.id } as T);
  });

  if (hasDistinct) {
    results = applyDistinct(results as Record<string, any>[], args?.distinct) as T[];
    if (typeof args?.take === 'number') {
      results = results.slice(0, args.take);
    }
  }

  if (args?.select) {
    results = results.map((row) => applySelect(row as any, args!.select)) as T[];
  }

  return results;
}

async function create<T extends { id?: unknown }>(
  model: string,
  args: { data: T }
): Promise<T & { id: string }> {
  const data = args.data;

  const ref =
    data.id !== undefined && data.id !== null
      ? col(model).doc(toDocId(data.id))
      : col(model).doc();

  await ref.set(stripUndefined(data) as WithFieldValue<DocumentData>);

  return {
    ...data,
    id: ref.id,
  } as T & { id: string };
}

async function update<T>(
  model: string,
  args: {
    where: { id: unknown };
    data: Partial<T>;
  }
): Promise<T & { id: string }> {
  const ref = col(model).doc(toDocId(args.where.id));

  await ref.update(stripUndefined(args.data) as DocumentData);

  const doc = await ref.get();

  return {
    ...(doc.data() as T),
    id: doc.id,
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

  let ref: FirebaseFirestore.DocumentReference;

  if ('id' in args.where && args.where.id !== undefined && args.where.id !== null) {
    ref = collection.doc(toDocId(args.where.id));
  } else {
    // Use the same compound-unique-key / scalar-field resolution as
    // findUnique — this was previously `applyWhere` directly, which doesn't
    // understand Prisma's `{ type_value: { type, value } }` wrapper shape
    // and would silently query on a nonexistent field, always missing and
    // creating a duplicate instead of updating.
    const query = resolveUniqueWhereQuery(collection, args.where);
    const snapshot = await query.limit(1).get();

    ref = snapshot.empty ? collection.doc() : snapshot.docs[0].ref;
  }

  const doc = await ref.get();

  if (doc.exists) {
    await ref.update(stripUndefined(args.update) as DocumentData);
  } else {
    await ref.set(stripUndefined(args.create) as WithFieldValue<DocumentData>);
  }

  const finalDoc = await ref.get();

  return {
    ...(finalDoc.data() as T),
    id: finalDoc.id,
  } as T & { id: string };
}

async function deleteMany(model: string, args?: { where?: WhereClause }): Promise<void> {
  const query = applyWhere(col(model), args?.where);
  const snapshot = await query.get();

  const batch = getDb().batch();
  snapshot.forEach((doc) => {
    batch.delete(doc.ref);
  });

  await batch.commit();
}

async function updateMany(
  model: string,
  args: { where?: WhereClause; data: Record<string, unknown> }
): Promise<{ count: number }> {
  const query = applyWhere(col(model), args.where);
  const snapshot = await query.get();

  const batch = getDb().batch();
  snapshot.forEach((doc) => {
    batch.update(doc.ref, args.data as DocumentData);
  });

  await batch.commit();
  return { count: snapshot.size };
}

async function count(model: string, args?: { where?: WhereClause }): Promise<number> {
  const query = applyWhere(col(model), args?.where);
  const snapshot = await query.get();
  return snapshot.size;
}

export interface AggregateArgs {
  where?: WhereClause;
  _sum?: Record<string, boolean>;
}

export interface AggregateResult {
  _sum: Record<string, number>;
  _count: { _all: number };
}

type UsageLogData = Record<string, unknown> & {
  invitationId?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
};

function tokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

async function incrementInvitationUsage(data: UsageLogData): Promise<void> {
  if (!data.invitationId) return;

  const inputTokens = tokenCount(data.inputTokens);
  const outputTokens = tokenCount(data.outputTokens);
  const totalTokens = inputTokens + outputTokens;

  if (totalTokens === 0) return;

  try {
    await col('invitations')
      .doc(toDocId(data.invitationId))
      .update({
        'usage.inputTokens': FieldValue.increment(inputTokens),
        'usage.outputTokens': FieldValue.increment(outputTokens),
        'usage.totalTokens': FieldValue.increment(totalTokens),
      });
  } catch (error: any) {
    if (error?.code === 5 || /not.?found/i.test(String(error?.message ?? ''))) {
      return;
    }
    throw error;
  }
}

async function incrementInvitationUsageMany(data: UsageLogData[]): Promise<void> {
  const byInvitation = new Map<string, { inputTokens: number; outputTokens: number }>();

  for (const entry of data) {
    if (!entry.invitationId) continue;
    const invitationId = toDocId(entry.invitationId);
    const current = byInvitation.get(invitationId) ?? { inputTokens: 0, outputTokens: 0 };
    current.inputTokens += tokenCount(entry.inputTokens);
    current.outputTokens += tokenCount(entry.outputTokens);
    byInvitation.set(invitationId, current);
  }

  await Promise.all(
    Array.from(byInvitation.entries()).map(([invitationId, usage]) =>
      incrementInvitationUsage({ invitationId, ...usage })
    )
  );
}

/**
 * Computes real sums (client-side, over the filtered result set) instead of
 * the previous hardcoded `{ _sum: {}, _count: {} }` stub. This is a
 * correctness fix, not a performance one — for hot paths like per-message
 * quota checks, prefer a denormalized running counter updated with
 * `FieldValue.increment()` over calling `aggregate()` on every check (see
 * docs/plans/15-firestore-shim-gaps.md).
 */
async function aggregate(model: string, args?: AggregateArgs): Promise<AggregateResult> {
  const query = applyWhere(col(model), args?.where);
  const snapshot = await query.get();

  const sums: Record<string, number> = {};
  if (args?._sum) {
    for (const field of Object.keys(args._sum)) {
      let total = 0;
      snapshot.forEach((doc) => {
        const value = (doc.data() as Record<string, unknown>)[field];
        if (typeof value === 'number') total += value;
      });
      sums[field] = total;
    }
  }

  return {
    _sum: sums,
    _count: { _all: snapshot.size },
  };
}

/**
 * Helper to build Prisma-like model proxy
 */
function modelProxy<T extends Record<string, any>>(model: string) {
  return {
    findUnique: (args: { where: Record<string, unknown>; select?: Record<string, boolean> }) =>
      findUnique<T>(model, args),

    findMany: (args?: FindManyArgs) => findMany<T>(model, args),

    create: (args: { data: T & { id?: unknown } }) => create<T>(model, args),

    update: (
      args: {
        where: { id: unknown };
        data: Partial<T>;
      }
    ) => update<T>(model, args),

    upsert: <W extends Record<string, unknown>>(args: {
      where: W;
      create: T;
      update: Partial<T>;
    }) => upsert<T>(model, args),

    delete: async (args: { where: { id: unknown } }) => {
      await col(model).doc(toDocId(args.where.id)).delete();
    },

    deleteMany: (args?: { where?: WhereClause }) => deleteMany(model, args),

    updateMany: (args: { where?: WhereClause; data: Record<string, unknown> }) =>
      updateMany(model, args),

    findFirst: async (args?: FindManyArgs) => {
      const list = await findMany<T>(model, { ...(args ?? {}), take: 1 });
      return list.length > 0 ? list[0] : null;
    },

    count: (args?: { where?: WhereClause }) => count(model, args),
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

  /**
   * NOT a real atomic transaction. Firestore's `db.runTransaction()` requires
   * all reads to happen before any writes within the transaction, but the
   * call sites that use `$transaction` in this codebase (`mergeUsers()`,
   * the OAuth handler's ContactMethod upsert) interleave updateMany / findMany
   * / update / upsert calls — restructuring them to satisfy that constraint
   * is a bigger change than this shim should make unilaterally.
   *
   * Instead, this just runs the callback against the regular (non-transactional)
   * `prisma` object, sequentially. Each individual operation still succeeds or
   * fails on its own, but there's no rollback and no isolation — a crash
   * partway through leaves partial writes applied, and concurrent requests can
   * interleave. Acceptable for current usage (account merge / login, both
   * low-concurrency, human-triggered flows) but worth knowing about before
   * relying on this shim under higher write concurrency.
   */
  $transaction: async <T>(callback: (tx: any) => Promise<T>): Promise<T> => {
    return callback(prisma);
  },

  conversationSession:
    modelProxy<any>('conversationSessions'),

  message:
    modelProxy<any>('messages'),

  lappScore:
    modelProxy<any>('lappScores'),

  usageLog: {
    ...modelProxy<any>('usageLogs'),

    create: async (
      args: { data: any }
    ) => {
      const created = await create<any>('usageLogs', args as any);
      await incrementInvitationUsage(args.data);
      return created;
    },

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
      await incrementInvitationUsageMany(unknownArgs.data);
    },

    aggregate: (
      args: AggregateArgs
    ) =>
      aggregate('usageLogs', args),
  },

  user: {
    ...modelProxy<any>('users'),

    delete: async (
      args: { where: { id: unknown } }
    ) => {
      await col('users')
        .doc(toDocId(args.where.id))
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

  feedback:
    modelProxy<any>('feedback'),
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

// Re-exported so packages/api/src/server.ts can import these from
// '@workspace/database' directly at startup (auto-seeding reference/test
// data). They were previously only reachable via a relative cross-package
// path that isn't part of this package's public "exports" map.
export { isDatabaseEmpty, seedReferenceData, seedTestData } from './seed/seedDatabase';

export type {
  ConversationSession,
  Message,
  LappScore,
  User,
  Invitation,
  TelemetryEvent,
  Scenario,
  UsageLog,
  ObservationNote,
  ExternalIdentity,
  ContactMethod,
  QuotaPreset,
} from '@prisma/client';
