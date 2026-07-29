// Minimal in-memory fake of the @google-cloud/firestore surface the shim
// (packages/database/index.ts) actually uses: collection(), doc(), get(),
// set(), update(), delete(), where(), orderBy(), limit(), and batch().
// This lets us unit-test the shim's query translation logic without an
// emulator and, critically, without ever touching a real Firestore project.
//
// Also understands two real sentinel classes from the actual
// @google-cloud/firestore package (imported for real, not faked, since
// they're plain value objects that don't need a live connection):
// `FieldPath.documentId()` (so `applyWhere`'s `id`-in-compound-where fix can
// be tested) and `FieldValue.increment()` (so the `{increment}` shorthand
// translation can be tested).

import { FieldPath, FieldValue } from '@google-cloud/firestore';

type Doc = Record<string, any>;

function getAtPath(obj: any, path: string): unknown {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function isDocumentIdFieldPath(field: unknown): boolean {
  return field instanceof FieldPath && field.isEqual(FieldPath.documentId());
}

/** Detects `FieldValue.increment(n)` sentinels by their real prototype/shape
 *  (the class isn't exported, only reachable via `FieldValue.increment()`). */
function isIncrementTransform(value: unknown): value is { operand: number } {
  return (
    value instanceof FieldValue &&
    typeof (value as any).operand === 'number' &&
    (value as any).constructor?.name === 'NumericIncrementTransform'
  );
}

function applyFieldValueTransforms(existing: Doc, patch: Doc): Doc {
  const result = { ...existing };
  for (const [field, value] of Object.entries(patch)) {
    if (isIncrementTransform(value)) {
      const current = typeof result[field] === 'number' ? result[field] : 0;
      result[field] = current + value.operand;
    } else {
      result[field] = value;
    }
  }
  return result;
}

function compare(op: string, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case '==':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '<':
      return (actual as any) < (expected as any);
    case '<=':
      return (actual as any) <= (expected as any);
    case '>':
      return (actual as any) > (expected as any);
    case '>=':
      return (actual as any) >= (expected as any);
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'not-in':
      return Array.isArray(expected) && !expected.includes(actual);
    default:
      throw new Error(`fakeFirestore: unsupported operator "${op}"`);
  }
}

class FakeDocRef {
  constructor(
    private store: Map<string, Doc>,
    public id: string
  ) {}

  async get() {
    const data = this.store.get(this.id);
    return {
      id: this.id,
      exists: data !== undefined,
      data: () => (data === undefined ? undefined : { ...data }),
      ref: this,
    };
  }

  async set(data: Doc) {
    this.store.set(this.id, { ...data });
  }

  async update(data: Doc) {
    const existing = this.store.get(this.id) ?? {};
    this.store.set(this.id, applyFieldValueTransforms(existing, data));
  }

  async delete() {
    this.store.delete(this.id);
  }
}

class FakeQuery {
  constructor(
    protected store: Map<string, Doc>,
    protected filters: Array<[string | FieldPath, string, unknown]> = [],
    protected sorts: Array<[string, 'asc' | 'desc']> = [],
    protected limitCount: number | null = null
  ) {}

  where(field: string | FieldPath, op: string, value: unknown) {
    return new FakeQuery(
      this.store,
      [...this.filters, [field, op, value]],
      this.sorts,
      this.limitCount
    );
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    return new FakeQuery(
      this.store,
      this.filters,
      [...this.sorts, [field, direction]],
      this.limitCount
    );
  }

  limit(n: number) {
    return new FakeQuery(this.store, this.filters, this.sorts, n);
  }

  async get() {
    let entries = Array.from(this.store.entries());

    for (const [field, op, value] of this.filters) {
      entries = entries.filter(([id, data]) =>
        isDocumentIdFieldPath(field)
          ? compare(op, id, value)
          : compare(op, getAtPath(data, field as string), value)
      );
    }

    for (const [field, direction] of this.sorts) {
      entries.sort((a, b) => {
        const av = getAtPath(a[1], field);
        const bv = getAtPath(b[1], field);
        if (av === bv) return 0;
        const cmp = (av as any) < (bv as any) ? -1 : 1;
        return direction === 'asc' ? cmp : -cmp;
      });
    }

    if (this.limitCount !== null) {
      entries = entries.slice(0, this.limitCount);
    }

    const docs = entries.map(([id, data]) => ({
      id,
      exists: true,
      data: () => ({ ...data }),
      ref: new FakeDocRef(this.store, id),
    }));

    return {
      empty: docs.length === 0,
      size: docs.length,
      docs,
      forEach: (fn: (doc: (typeof docs)[number]) => void) => docs.forEach(fn),
    };
  }
}

class FakeCollectionRef extends FakeQuery {
  private counter = 0;

  doc(id?: string) {
    const docId = id ?? `auto_${++this.counter}_${Math.random().toString(36).slice(2, 8)}`;
    return new FakeDocRef(this.store, docId);
  }
}

export class FakeFirestore {
  private collections = new Map<string, Map<string, Doc>>();

  collection(name: string) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    return new FakeCollectionRef(this.collections.get(name)!);
  }

  batch() {
    const ops: Array<() => void> = [];
    return {
      set: (ref: FakeDocRef, data: Doc) => {
        ops.push(() => ref.set(data));
      },
      update: (ref: FakeDocRef, data: Doc) => {
        ops.push(() => ref.update(data));
      },
      delete: (ref: FakeDocRef) => {
        ops.push(() => ref.delete());
      },
      commit: async () => {
        for (const op of ops) await op();
      },
    };
  }

  /** Test helper: seed a doc directly, bypassing the shim. */
  seed(collectionName: string, id: string, data: Doc) {
    if (!this.collections.has(collectionName)) {
      this.collections.set(collectionName, new Map());
    }
    this.collections.get(collectionName)!.set(id, data);
  }

  /**
   * Minimal fake of Firestore's `runTransaction()` — no real isolation or
   * retry-on-contention (this is a single-threaded test double), just
   * correct sequential get/set semantics, which is all the shim's
   * auto-increment counter logic needs to be tested.
   */
  async runTransaction<T>(updateFn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    return updateFn(new FakeTransaction());
  }
}

class FakeTransaction {
  async get(refOrQuery: { get: () => Promise<any> }) {
    return refOrQuery.get();
  }

  set(ref: FakeDocRef, data: Doc) {
    // Real Firestore's Transaction.set() is sync (queues the write); apply
    // immediately here since the fake has no distributed commit phase.
    void ref.set(data);
  }
}
