// Minimal in-memory fake of the @google-cloud/firestore surface the shim
// (packages/database/index.ts) actually uses: collection(), doc(), get(),
// set(), update(), delete(), where(), orderBy(), limit(), and batch().
// This lets us unit-test the shim's query translation logic without an
// emulator and, critically, without ever touching a real Firestore project.

type Doc = Record<string, any>;

function getAtPath(obj: any, path: string): unknown {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
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
    this.store.set(this.id, { ...existing, ...data });
  }

  async delete() {
    this.store.delete(this.id);
  }
}

class FakeQuery {
  constructor(
    protected store: Map<string, Doc>,
    protected filters: Array<[string, string, unknown]> = [],
    protected sorts: Array<[string, 'asc' | 'desc']> = [],
    protected limitCount: number | null = null
  ) {}

  where(field: string, op: string, value: unknown) {
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
      entries = entries.filter(([, data]) => compare(op, getAtPath(data, field), value));
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
}
