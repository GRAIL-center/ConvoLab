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
    dbInstance = new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID });
  }
  return dbInstance;
}
