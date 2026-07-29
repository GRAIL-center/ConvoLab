import { Firestore } from '@google-cloud/firestore';

let dbInstance: Firestore | null = null;

/**
 * Returns a singleton Firestore client.
 * Throws an error if FIRESTORE_PROJECT_ID is not set.
 */
export function getFirestoreClient(): Firestore {
  if (!process.env.FIRESTORE_PROJECT_ID) {
    throw new Error('FIRESTORE_PROJECT_ID is not set');
  }
  if (!dbInstance) {
    // Prisma/Postgres treats an explicit `undefined` field on `create`/`update`
    // as "don't set this column" (roughly like omitting it or writing NULL).
    // The Firestore Node SDK's default behavior is stricter — it throws
    // ("Cannot use 'undefined' as a Firestore value") the moment any field
    // anywhere in the document is `undefined`, which breaks on the first
    // optional field that isn't provided (e.g. Message.metadata on a plain
    // user message). `ignoreUndefinedProperties` makes undefined fields get
    // silently skipped instead, matching the semantics callers already
    // expect from the old Prisma client.
    dbInstance = new Firestore({
      projectId: process.env.FIRESTORE_PROJECT_ID,
      ignoreUndefinedProperties: true,
    });
  }
  return dbInstance;
}
