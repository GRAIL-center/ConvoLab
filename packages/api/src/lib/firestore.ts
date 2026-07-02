import { Firestore } from '@google-cloud/firestore';

// Initialize a Firestore client using the same project ID as in context.
function getFirestore() {
  return new Firestore({
    projectId: process.env.FIRESTORE_PROJECT_ID || 'test-project',
  });
}

/**
 * Get a reference to a collection.
 * @param name The collection name.
 */
export function collection(name: string) {
  return getFirestore().collection(name);
}

/**
 * Create a document in a collection.
 * @param coll Collection name.
 * @param data Document data.
 * @param docId Optional document ID. If omitted, Firestore generates one.
 */
export async function createDoc<T>(
  coll: string,
  data: T,
  docId?: string,
): Promise<string> {
  const ref = docId ? collection(coll).doc(docId) : collection(coll).doc();
  await ref.set(data as any);
  return ref.id;
}

/**
 * Retrieve a document by ID.
 * @param coll Collection name.
 * @param id Document ID.
 */
export async function getDoc<T>(coll: string, id: string): Promise<T | null> {
  const doc = await collection(coll).doc(id).get();
  if (!doc.exists) return null;
  return doc.data() as T;
}

/**
 * Query a collection with optional cursor/limit.
 * @param coll Collection name.
 * @param options Query options.
 */
export async function queryCollection(
  coll: string,
  options: {
    cursor?: string;
    limit?: number;
    orderBy?: string;
    direction?: 'asc' | 'desc';
  } = {}
) {
  let q = collection(coll).orderBy(
    options.orderBy ?? 'createdAt',
    options.direction ?? 'desc'
  );
  if (options.cursor) {
    const cursorDoc = await collection(coll).doc(options.cursor).get();
    if (cursorDoc.exists) {
      q = q.startAfter(cursorDoc);
    }
  }
  if (options.limit) {
    q = q.limit(options.limit);
  }
  const snapshot = await q.get();
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}
