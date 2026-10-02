// Minimal in-memory fake of the @google-cloud/firestore surface the shim
// (packages/database/index.ts) actually uses: collection(), doc(), get(),
// set(), update(), delete(), where(), orderBy(), limit(), and batch().
// This lets us unit-test the shim's query translation logic without an
// emulator and, critically, without ever touching a real Firestore project.

import { Timestamp } from '@google-cloud/firestore';

type Doc = Record<string, any>;

// Real Firestore stores JS Dates as Timestamps and returns Timestamps from
// doc.data(). Mirror that on every write path so shim tests exercise the
// Timestamp -> Date conversion the shim performs on reads (B26: a leaked
// Timestamp compared as "less than" any Date, expiring every invitation).
function datesToTimestamps(value: unknown): unknown {
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (Array.isArray(value)) return value.map(datesToTimestamps);
  if (
    value !== null &&
    typeof value === 'object' &&
    !(value instanceof Timestamp) &&
    (value as any).constructor?.name !== 'NumericIncrementTransform'
  ) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, datesToTimestamps(v)])
    );
  }
  return value;
}

function getAtPath(obj: any, path: string): unknown {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setAtPath(obj: any, path: string, value: unknown): void {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys.slice(0, -1)) {
    current[key] ??= {};
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

function applyUpdate(existing: Doc, data: Doc): Doc {
  const next = { ...existing };

  for (const [field, value] of Object.entries(data)) {
    const increment =
      value &&
      typeof value === 'object' &&
      (value as any).constructor?.name === 'NumericIncrementTransform'
        ? (value as any).operand
        : null;

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

// Firestore compares timestamps by instant regardless of whether the query
// value is a Date or a Timestamp; coerce both sides to millis so the fake
// does too (plain JS comparison of Timestamp vs Date is wrong — see B26).
function comparable(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return value;
}

function compare(op: string, rawActual: unknown, rawExpected: unknown): boolean {
  const actual = comparable(rawActual);
  const expected = Array.isArray(rawExpected)
    ? rawExpected.map(comparable)
    : comparable(rawExpected);
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
    this.store.set(this.id, datesToTimestamps({ ...data }) as Doc);
  }

  async update(data: Doc) {
    const existing = this.store.get(this.id);
    if (!existing) {
      const error = new Error(`Document ${this.id} not found`) as Error & { code?: number };
      error.code = 5;
      throw error;
    }
    this.store.set(this.id, applyUpdate(existing, datesToTimestamps(data) as Doc));
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
        const av = comparable(getAtPath(a[1], field));
        const bv = comparable(getAtPath(b[1], field));
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
    this.collections.get(collectionName)!.set(id, datesToTimestamps(data) as Doc);
  }
}
