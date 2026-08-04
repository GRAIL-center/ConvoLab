// Minimal in-memory fake of the @google-cloud/firestore surface used by the
// Firestore shim. API tests use this through src/__tests__/setup.ts so the
// default Vitest suite never connects to a real Firestore or Cloud SQL project.

type Doc = Record<string, unknown>;

interface FakeDocSnapshot {
  id: string;
  exists: boolean;
  data: () => Doc | undefined;
  ref: FakeDocRef;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getAtPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((acc, key) => (isRecord(acc) ? acc[key] : undefined), obj);
}

function setAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  for (const key of keys.slice(0, -1)) {
    if (!isRecord(current[key])) current[key] = {};
    const next = current[key];
    if (!isRecord(next)) throw new Error(`fakeFirestore: invalid nested path "${path}"`);
    current = next;
  }
  current[keys[keys.length - 1]] = value;
}

function getIncrementOperand(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const valueConstructor = value.constructor;
  if (!isRecord(valueConstructor) || valueConstructor.name !== 'NumericIncrementTransform') {
    return null;
  }
  return typeof value.operand === 'number' ? value.operand : null;
}

function compareOrdered(actual: unknown, expected: unknown): number {
  if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() - expected.getTime();
  }
  if (typeof actual === 'number' && typeof expected === 'number') {
    return actual - expected;
  }
  if (typeof actual === 'string' && typeof expected === 'string') {
    return actual.localeCompare(expected);
  }
  return String(actual).localeCompare(String(expected));
}

function applyUpdate(existing: Doc, data: Doc): Doc {
  const next = { ...existing };

  for (const [field, value] of Object.entries(data)) {
    const increment = getIncrementOperand(value);

    if (typeof increment === 'number') {
      const current = getAtPath(next, field);
      setAtPath(next, field, (typeof current === 'number' ? current : 0) + increment);
      continue;
    }

    if (field.includes('.')) {
      setAtPath(next, field, value);
    } else {
      next[field] = value;
    }
  }

  return next;
}

function compare(op: string, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case '==':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '<':
      return compareOrdered(actual, expected) < 0;
    case '<=':
      return compareOrdered(actual, expected) <= 0;
    case '>':
      return compareOrdered(actual, expected) > 0;
    case '>=':
      return compareOrdered(actual, expected) >= 0;
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

  async get(): Promise<FakeDocSnapshot> {
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
    const existing = this.store.get(this.id);
    if (!existing) {
      const error = new Error(`Document ${this.id} not found`) as Error & { code?: number };
      error.code = 5;
      throw error;
    }
    this.store.set(this.id, applyUpdate(existing, data));
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
        const cmp = compareOrdered(av, bv);
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

  reset() {
    this.collections = new Map();
  }
}
