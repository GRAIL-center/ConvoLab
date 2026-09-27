import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeFirestore } from './fakeFirestore';

const fakeDb = new FakeFirestore();

vi.mock('../firestoreClient', () => ({
  getFirestoreClient: () => fakeDb,
}));

// Imported after the mock is registered so `prisma` picks up the fake client.
const { formatReconcileReport, prisma, reconcileReferenceData, seedReferenceData } = await import(
  '../../index'
);
const { computeContentHash, currentSeedVersion, SCENARIO_HASH_FIELDS } = await import(
  '../../seed/referenceHash'
);

type Event = Record<string, unknown> & { event: string };

async function reconcile(seedVersion = 'test-sha') {
  const events: Event[] = [];
  const summary = await reconcileReferenceData(prisma, {
    seedVersion,
    logEvent: (event) => events.push(event),
    log: () => {},
  });
  return { events, summary };
}

type StoredDoc = Record<string, unknown>;
// The fake's backing store, read directly so assertions see exactly what was written.
const internals = fakeDb as unknown as { collections: Map<string, Map<string, StoredDoc>> };

function storedDocs(collection: string): Map<string, StoredDoc> {
  return internals.collections.get(collection) ?? new Map();
}

function storedBySlug(slug: string): { id: string; data: StoredDoc } {
  for (const [id, data] of storedDocs('scenarios')) {
    if (data.slug === slug) return { id, data };
  }
  throw new Error(`no stored scenario ${slug}`);
}

beforeEach(() => {
  internals.collections = new Map();
});

describe('reconcileReferenceData', () => {
  it('seeds everything into a fresh database and logs each creation', async () => {
    const { events, summary } = await reconcile();

    expect(summary.scenarios.created.length).toBeGreaterThan(0);
    expect(summary.scenarios.upserted).toEqual([]);
    expect(summary.quotaPresets.created.length).toBeGreaterThan(0);
    expect(storedDocs('scenarios').size).toBe(summary.scenarios.created.length);
    expect(storedDocs('quotaPresets').size).toBe(summary.quotaPresets.created.length);

    const created = events.filter((e) => e.event === 'reference_seed_created');
    expect(created).toHaveLength(
      summary.scenarios.created.length + summary.quotaPresets.created.length
    );
    expect(events.at(-1)).toMatchObject({
      event: 'reference_seed_reconciled',
      created: created.length,
      upserted: 0,
    });

    const uncle = storedBySlug('angry-uncle-thanksgiving').data;
    expect(uncle.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(uncle.seedVersion).toBe('test-sha');
    expect(uncle.seededAt).toBeInstanceOf(Date);
    expect(uncle.isActive).toBe(true);
  });

  it('changes nothing on a second run and logs reference_seed_unchanged with counts', async () => {
    const first = await reconcile();
    const before = new Map(
      [...storedDocs('scenarios')].map(([id, data]) => [id, { ...data }] as const)
    );

    const { events, summary } = await reconcile('a-later-sha');

    expect(summary.scenarios.created).toEqual([]);
    expect(summary.scenarios.upserted).toEqual([]);
    expect(summary.quotaPresets.upserted).toEqual([]);
    expect(events).toEqual([
      {
        event: 'reference_seed_unchanged',
        scenarios: first.summary.scenarios.created.length,
        quotaPresets: first.summary.quotaPresets.created.length,
        seedVersion: 'a-later-sha',
      },
    ]);
    // Untouched: not even seedVersion/seededAt were rewritten.
    expect(new Map(storedDocs('scenarios'))).toEqual(before);
  });

  it('upserts exactly the scenario whose prompt changed and updates its hash', async () => {
    await reconcile();
    const target = storedBySlug('difficult-coworker');
    const oldHash = target.data.contentHash;
    // Simulate the stored prompt predating a repo edit: stale text and hash.
    fakeDb.seed('scenarios', target.id, {
      ...target.data,
      partnerSystemPrompt: 'an older prompt text',
      contentHash: 'stale-hash',
    });

    const { events, summary } = await reconcile('new-sha');

    expect(summary.scenarios.upserted).toEqual(['difficult-coworker']);
    expect(summary.quotaPresets.upserted).toEqual([]);
    const upserted = events.filter((e) => e.event === 'reference_seed_upserted');
    expect(upserted).toEqual([
      {
        event: 'reference_seed_upserted',
        kind: 'scenario',
        slug: 'difficult-coworker',
        from: 'stale-hash',
        to: oldHash,
        fields: ['partnerSystemPrompt'],
      },
    ]);
    const after = storedBySlug('difficult-coworker');
    expect(after.id).toBe(target.id);
    expect(after.data.contentHash).toBe(oldHash);
    expect(after.data.partnerSystemPrompt).not.toBe('an older prompt text');
    expect(after.data.seedVersion).toBe('new-sha');
    // Every other scenario kept the version it was seeded with.
    for (const [, data] of storedDocs('scenarios')) {
      if (data.slug !== 'difficult-coworker') expect(data.seedVersion).toBe('test-sha');
    }
  });

  it('treats a document seeded before hashes existed as changed', async () => {
    fakeDb.seed('scenarios', 'legacy-1', {
      slug: 'angry-uncle-thanksgiving',
      name: 'Angry Uncle at Thanksgiving',
      partnerSystemPrompt: 'old',
    });

    const { events } = await reconcile();

    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'reference_seed_upserted',
        slug: 'angry-uncle-thanksgiving',
        from: null,
      })
    );
    // Updated in place, not duplicated.
    const uncles = [...storedDocs('scenarios').values()].filter(
      (d) => d.slug === 'angry-uncle-thanksgiving'
    );
    expect(uncles).toHaveLength(1);
    expect(storedDocs('scenarios').has('legacy-1')).toBe(true);
  });

  it('merges into the stored document: unknown fields survive, seed-owned fields are overwritten', async () => {
    fakeDb.seed('scenarios', 'hand-edited', {
      slug: 'difficult-coworker',
      name: 'A name someone typed in the console',
      createdAt: '2026-01-01T00:00:00.000Z',
      adminNote: 'keep me',
      contentHash: 'stale-hash',
    });

    await reconcile();

    const doc = storedDocs('scenarios').get('hand-edited')!;
    expect(doc.adminNote).toBe('keep me');
    expect(doc.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(doc.name).toBe('Difficult Coworker Feedback');
    expect(doc.contentHash).not.toBe('stale-hash');
  });

  it('never touches sessions, users or invitations', async () => {
    fakeDb.seed('conversationSessions', 's1', { scenarioId: 'x', status: 'ACTIVE' });
    fakeDb.seed('users', 'u1', { name: 'Someone' });
    fakeDb.seed('invitations', 'i1', { token: 't' });

    await reconcile();
    await reconcile();

    expect([...storedDocs('conversationSessions')]).toEqual([
      ['s1', { scenarioId: 'x', status: 'ACTIVE' }],
    ]);
    expect([...storedDocs('users')]).toEqual([['u1', { name: 'Someone' }]]);
    expect([...storedDocs('invitations')]).toEqual([['i1', { token: 't' }]]);
  });

  it('writes the same hash as the unconditional seedReferenceData, so the two paths agree', async () => {
    await seedReferenceData(prisma, { seedVersion: 'test-sha', log: () => {} });
    const { summary } = await reconcile();
    expect(summary.scenarios.upserted).toEqual([]);
    expect(summary.scenarios.created).toEqual([]);
    expect(summary.quotaPresets.upserted).toEqual([]);
  });
});

describe('reconcileReferenceData dryRun', () => {
  function snapshot() {
    return JSON.stringify(
      [...internals.collections].map(([name, docs]) => [name, [...docs]]),
      (_k, v) => (v instanceof Date ? v.toISOString() : v)
    );
  }

  it('reports a changed prompt as update listing partnerSystemPrompt, and writes nothing', async () => {
    await reconcile();
    const target = storedBySlug('general-populist-female');
    fakeDb.seed('scenarios', target.id, {
      ...target.data,
      partnerSystemPrompt: 'an older prompt text',
      coachModel: 'anthropic:claude-hand-set',
      contentHash: 'stale-hash',
    });
    const before = snapshot();

    const events: Event[] = [];
    const summary = await reconcileReferenceData(prisma, {
      dryRun: true,
      seedVersion: 'dry-sha',
      logEvent: (e) => events.push(e),
    });

    expect(snapshot()).toBe(before);
    expect(summary.dryRun).toBe(true);
    const updates = summary.report.filter((r) => r.action === 'update');
    expect(updates).toHaveLength(1);
    const [entry] = updates;
    expect(entry).toMatchObject({
      kind: 'scenario',
      key: 'general-populist-female',
      fromHash: 'stale-hash',
      toHash: target.data.contentHash,
    });
    expect(entry.fields.map((f) => f.field)).toEqual(['partnerSystemPrompt', 'coachModel']);
    const prompt = entry.fields[0];
    expect(prompt.effect).toBe('overwrite');
    expect(prompt.old).toEqual({
      length: 'an older prompt text'.length,
      sha256: expect.any(String),
    });
    expect(prompt.new?.length).toBe((target.data.partnerSystemPrompt as string).length);
    // The seed sets no coachModel, and updates merge, so a hand-set one survives.
    expect(entry.fields[1]).toMatchObject({ field: 'coachModel', effect: 'kept', new: null });
    expect(summary.report.filter((r) => r.action === 'unchanged').length).toBe(
      summary.report.length - 1
    );
    expect(events.map((e) => e.event)).toEqual(['reference_seed_dry_run']);

    const table = formatReconcileReport(summary);
    expect(table).toContain('general-populist-female');
    expect(table).toContain('partnerSystemPrompt (overwrite');
    expect(table).toContain('DRY RUN, nothing written');
    // Never prompt text, old or new.
    expect(table).not.toContain('an older prompt text');
    expect(table).not.toContain((target.data.partnerSystemPrompt as string).slice(0, 40));
  });

  it('reports create for everything on an empty database without writing', async () => {
    const summary = await reconcileReferenceData(prisma, { dryRun: true, logEvent: () => {} });
    expect(summary.report.every((r) => r.action === 'create')).toBe(true);
    expect(storedDocs('scenarios').size).toBe(0);
    expect(storedDocs('quotaPresets').size).toBe(0);
  });

  it('then a real run does exactly what the dry run reported', async () => {
    await reconcile();
    const target = storedBySlug('difficult-coworker');
    fakeDb.seed('scenarios', target.id, { ...target.data, name: 'old', contentHash: 'x' });
    const dry = await reconcileReferenceData(prisma, { dryRun: true, logEvent: () => {} });
    const real = await reconcileReferenceData(prisma, { logEvent: () => {} });
    const strip = (s: typeof dry) =>
      s.report.map(({ kind, key, action }) => ({ kind, key, action }));
    expect(strip(real)).toEqual(strip(dry));
    expect(storedBySlug('difficult-coworker').data.name).toBe('Difficult Coworker Feedback');
  });
});

describe('computeContentHash', () => {
  const base = {
    slug: 's',
    name: 'n',
    partnerSystemPrompt: 'p',
    coachSystemPrompt: 'c',
    isActive: true,
  };

  it('is deterministic and ignores key order and bookkeeping fields', () => {
    const reordered = {
      isActive: true,
      coachSystemPrompt: 'c',
      partnerSystemPrompt: 'p',
      name: 'n',
      slug: 's',
    };
    const withBookkeeping = { ...base, contentHash: 'x', seedVersion: 'y', seededAt: new Date() };
    const hash = computeContentHash(base, SCENARIO_HASH_FIELDS);
    expect(computeContentHash(reordered, SCENARIO_HASH_FIELDS)).toBe(hash);
    expect(computeContentHash(withBookkeeping, SCENARIO_HASH_FIELDS)).toBe(hash);
  });

  it('changes when any hashed field changes', () => {
    const hash = computeContentHash(base, SCENARIO_HASH_FIELDS);
    expect(
      computeContentHash({ ...base, partnerSystemPrompt: 'p2' }, SCENARIO_HASH_FIELDS)
    ).not.toBe(hash);
    expect(computeContentHash({ ...base, partnerModel: 'm' }, SCENARIO_HASH_FIELDS)).not.toBe(hash);
  });

  it('refuses a seeded field that is not in the hash list', () => {
    expect(() => computeContentHash({ ...base, newField: 1 }, SCENARIO_HASH_FIELDS)).toThrow(
      /newField/
    );
  });

  it('reads the commit from GIT_SHA, then _TAG, else unknown', () => {
    expect(currentSeedVersion({ GIT_SHA: 'abc', _TAG: 'def' })).toBe('abc');
    expect(currentSeedVersion({ _TAG: 'def' })).toBe('def');
    expect(currentSeedVersion({})).toBe('unknown');
  });
});
