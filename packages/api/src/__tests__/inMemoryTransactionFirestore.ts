// In-memory Firestore double for the atomic suite: serialised transactions
// with staged writes, `create` that fails on an existing document, and an
// injectable commit failure. Shared by atomic.test.ts and
// voiceExchanges.atomic.test.ts.
import type { Firestore } from '@google-cloud/firestore';

interface Ref {
  id: string;
  path: string;
}

export class InMemoryFirestore {
  private documents = new Map<string, Record<string, unknown>>();
  private nextId = 0;
  private transactionQueue = Promise.resolve();
  failCommit = false;

  collection(name: string) {
    return {
      doc: (id = `generated-${++this.nextId}`): Ref => ({
        id,
        path: `${name}/${id}`,
      }),
    };
  }

  seed(path: string, data: Record<string, unknown>) {
    this.documents.set(path, structuredClone(data));
  }

  read(path: string) {
    const value = this.documents.get(path);
    return value ? structuredClone(value) : undefined;
  }

  countCollection(name: string) {
    return [...this.documents.keys()].filter((path) => path.startsWith(`${name}/`)).length;
  }

  async runTransaction<T>(
    callback: (transaction: {
      get: (ref: Ref) => Promise<{
        id: string;
        exists: boolean;
        data: () => Record<string, unknown> | undefined;
      }>;
      create: (ref: Ref, data: Record<string, unknown>) => void;
      update: (ref: Ref, data: Record<string, unknown>) => void;
    }) => Promise<T>
  ): Promise<T> {
    const previous = this.transactionQueue;
    let release!: () => void;
    this.transactionQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const staged = new Map<string, Record<string, unknown>>();
    try {
      const result = await callback({
        get: async (ref) => {
          const data = staged.get(ref.path) ?? this.documents.get(ref.path);
          return {
            id: ref.id,
            exists: data !== undefined,
            data: () => (data ? structuredClone(data) : undefined),
          };
        },
        create: (ref, data) => {
          if (this.documents.has(ref.path) || staged.has(ref.path)) {
            throw new Error('already exists');
          }
          staged.set(ref.path, structuredClone(data));
        },
        update: (ref, data) => {
          const current = staged.get(ref.path) ?? this.documents.get(ref.path);
          if (!current) throw new Error('not found');
          staged.set(ref.path, { ...structuredClone(current), ...structuredClone(data) });
        },
      });

      if (this.failCommit) throw new Error('injected commit failure');
      for (const [path, data] of staged) this.documents.set(path, data);
      return result;
    } finally {
      release();
    }
  }
}

export function asFirestore(fake: InMemoryFirestore): Firestore {
  return fake as unknown as Firestore;
}
