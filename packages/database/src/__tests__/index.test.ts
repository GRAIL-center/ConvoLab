import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeFirestore } from './fakeFirestore';

const fakeDb = new FakeFirestore();

vi.mock('../firestoreClient', () => ({
  getFirestoreClient: () => fakeDb,
}));

// Imported after the mock is registered so `prisma` picks up the fake client.
const { prisma } = await import('../../index');

beforeEach(() => {
  // Fresh store per test.
  (fakeDb as any).collections = new Map();
});

describe('findMany — where / orderBy / select / distinct', () => {
  it('filters on plain equality (regression: admin list used to ignore `where` entirely)', async () => {
    await prisma.user.create({ data: { id: 'u1', name: 'Admin One', role: 'ADMIN' } });
    await prisma.user.create({ data: { id: 'u2', name: 'Regular', role: 'USER' } });
    await prisma.user.create({ data: { id: 'u3', name: 'Admin Two', role: 'ADMIN' } });

    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });

    expect(admins).toHaveLength(2);
    expect(admins.map((u: any) => u.id).sort()).toEqual(['u1', 'u3']);
  });

  it('supports gte/lte range filters (regression: telemetry dashboard date range)', async () => {
    await prisma.telemetryEvent.create({
      data: { id: 't1', name: 'conversation_started', createdAt: '2026-01-01T00:00:00.000Z' },
    });
    await prisma.telemetryEvent.create({
      data: { id: 't2', name: 'conversation_started', createdAt: '2026-06-15T00:00:00.000Z' },
    });
    await prisma.telemetryEvent.create({
      data: { id: 't3', name: 'conversation_started', createdAt: '2026-12-31T00:00:00.000Z' },
    });

    const inRange = await prisma.telemetryEvent.findMany({
      where: {
        createdAt: { gte: '2026-03-01T00:00:00.000Z', lte: '2026-09-01T00:00:00.000Z' },
      },
    });

    expect(inRange.map((e: any) => e.id)).toEqual(['t2']);
  });

  it('supports Prisma JSON-path filters (regression: telemetry `properties.reason` filter)', async () => {
    await prisma.telemetryEvent.create({
      data: { id: 'e1', name: 'conversation_ended', properties: { reason: 'completed' } },
    });
    await prisma.telemetryEvent.create({
      data: { id: 'e2', name: 'conversation_ended', properties: { reason: 'abandoned' } },
    });

    const completed = await prisma.telemetryEvent.findMany({
      where: {
        name: 'conversation_ended',
        properties: { path: ['reason'], equals: 'completed' },
      },
    });

    expect(completed.map((e: any) => e.id)).toEqual(['e1']);
  });

  it('applies orderBy', async () => {
    await prisma.scenario.create({ data: { id: 3, name: 'Charlie', isActive: true } });
    await prisma.scenario.create({ data: { id: 1, name: 'Alpha', isActive: true } });
    await prisma.scenario.create({ data: { id: 2, name: 'Bravo', isActive: true } });

    const scenarios = await prisma.scenario.findMany({ orderBy: { name: 'asc' } });

    expect(scenarios.map((s: any) => s.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('applies select (regression: invitation.list used to return every field regardless of `select`)', async () => {
    await prisma.scenario.create({
      data: { id: 1, name: 'Alpha', description: 'secret internal notes', isActive: true },
    });

    const [scenario] = await prisma.scenario.findMany({
      select: { id: true, name: true },
    });

    expect(scenario).toEqual({ id: '1', name: 'Alpha' });
    expect(scenario.description).toBeUndefined();
  });

  it('applies distinct', async () => {
    await prisma.telemetryEvent.create({ data: { id: 'e1', name: 'conversation_started' } });
    await prisma.telemetryEvent.create({ data: { id: 'e2', name: 'conversation_started' } });
    await prisma.telemetryEvent.create({ data: { id: 'e3', name: 'message_sent' } });

    const names = await prisma.telemetryEvent.findMany({
      select: { name: true },
      distinct: ['name'],
    });

    expect(names.map((n: any) => n.name).sort()).toEqual(['conversation_started', 'message_sent']);
  });

  it('throws instead of silently dropping `include` (relational joins)', async () => {
    await prisma.invitation.create({ data: { id: 'i1', createdById: 'u1' } });

    await expect(
      prisma.invitation.findMany({
        where: { createdById: 'u1' },
        include: { scenario: true },
      })
    ).rejects.toThrow(/include.*not supported/i);
  });

  it('throws on unsupported OR/AND combinators instead of ignoring them', async () => {
    await expect(
      prisma.user.findMany({ where: { OR: [{ role: 'ADMIN' }, { role: 'STAFF' }] } })
    ).rejects.toThrow(/OR.*not supported/i);
  });
});

describe('count — where support', () => {
  it('counts only matching docs (regression: admin-demotion lockout guard)', async () => {
    await prisma.user.create({ data: { id: 'u1', role: 'ADMIN' } });
    await prisma.user.create({ data: { id: 'u2', role: 'USER' } });
    await prisma.user.create({ data: { id: 'u3', role: 'USER' } });

    const totalUsers = await prisma.user.count();
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });

    expect(totalUsers).toBe(3);
    expect(adminCount).toBe(1);
  });
});

describe('aggregate — real sums', () => {
  it('sums matching docs instead of returning the hardcoded empty stub (regression: quota enforcement)', async () => {
    await prisma.usageLog.create({
      data: { id: 'l1', invitationId: 'inv1', inputTokens: 100, outputTokens: 50 },
    });
    await prisma.usageLog.create({
      data: { id: 'l2', invitationId: 'inv1', inputTokens: 200, outputTokens: 75 },
    });
    await prisma.usageLog.create({
      data: { id: 'l3', invitationId: 'inv-other', inputTokens: 9999, outputTokens: 9999 },
    });

    const result = await prisma.usageLog.aggregate({
      where: { invitationId: 'inv1' },
      _sum: { inputTokens: true, outputTokens: true },
    });

    expect(result._sum.inputTokens).toBe(300);
    expect(result._sum.outputTokens).toBe(125);
  });
});

describe('findUnique — id and compound-key lookups', () => {
  it('finds by id (baseline)', async () => {
    await prisma.user.create({ data: { id: 'u1', name: 'Alice' } });
    const found = await prisma.user.findUnique({ where: { id: 'u1' } });
    expect(found?.name).toBe('Alice');
  });

  it('returns null for a missing id', async () => {
    const found = await prisma.user.findUnique({ where: { id: 'nope' } });
    expect(found).toBeNull();
  });

  it('finds by compound unique key (regression: Google OAuth login was throwing here)', async () => {
    await prisma.externalIdentity.create({
      data: { id: 'ei1', userId: 'u1', provider: 'google', externalId: 'sub-123' },
    });

    const found = await prisma.externalIdentity.findUnique({
      where: { provider_externalId: { provider: 'google', externalId: 'sub-123' } },
    });

    expect(found?.userId).toBe('u1');
  });

  it('returns null for a compound key with no match', async () => {
    const found = await prisma.externalIdentity.findUnique({
      where: { provider_externalId: { provider: 'google', externalId: 'nonexistent' } },
    });
    expect(found).toBeNull();
  });

  it('finds by a single scalar unique field, e.g. Invitation.token (regression: invitation claim/getByToken)', async () => {
    await prisma.invitation.create({ data: { id: 'inv1', token: 'tok-abc', label: 'Test' } });

    const found = await prisma.invitation.findUnique({ where: { token: 'tok-abc' } as any });

    expect(found?.id).toBe('inv1');
  });

  it('returns null for a scalar unique field with no match', async () => {
    const found = await prisma.invitation.findUnique({ where: { token: 'nope' } as any });
    expect(found).toBeNull();
  });

  it('throws on an unsupported where shape (multiple top-level keys)', async () => {
    await expect(
      prisma.user.findUnique({ where: { email: 'a@b.com', role: 'ADMIN' } as any })
    ).rejects.toThrow(/unsupported findUnique/i);
  });
});

describe('numeric (Int) primary keys get coerced to string doc ids', () => {
  it('create/findUnique/update/delete all work with a numeric id', async () => {
    const created = await prisma.scenario.create({ data: { id: 42, name: 'Numeric Id Test' } });
    expect(created.id).toBe('42');

    // Router call sites pass the raw Zod-parsed number, e.g. `where: { id: input.scenarioId }`.
    const found = await prisma.scenario.findUnique({ where: { id: 42 as any } });
    expect(found?.name).toBe('Numeric Id Test');

    const updated = await prisma.scenario.update({
      where: { id: 42 as any },
      data: { name: 'Renamed' },
    });
    expect(updated.name).toBe('Renamed');

    await prisma.scenario.delete({ where: { id: 42 as any } });
    const afterDelete = await prisma.scenario.findUnique({ where: { id: 42 as any } });
    expect(afterDelete).toBeNull();
  });
});

describe('upsert', () => {
  it('creates when missing, updates when present, by id', async () => {
    const created = await prisma.quotaPreset.upsert({
      where: { id: 'p1' },
      create: { id: 'p1', name: 'short', label: 'Short conversation' },
      update: { label: 'Should not be used' },
    });
    expect(created.label).toBe('Short conversation');

    const updated = await prisma.quotaPreset.upsert({
      where: { id: 'p1' },
      create: { id: 'p1', name: 'short', label: 'Should not be used' },
      update: { label: 'Updated label' },
    });
    expect(updated.label).toBe('Updated label');
  });

  it('falls back to a unique-field query when `where` has no id', async () => {
    await prisma.quotaPreset.create({ data: { id: 'p2', name: 'quick', label: 'Quick chat' } });

    const updated = await prisma.quotaPreset.upsert({
      where: { name: 'quick' },
      create: { id: 'ignored', name: 'quick', label: 'Should not be used' },
      update: { label: 'Updated via unique field' },
    });

    expect(updated.id).toBe('p2');
    expect(updated.label).toBe('Updated via unique field');
  });
});

describe('updateMany', () => {
  it('updates only matching docs and leaves others untouched (regression: guest-invitation unclaim, mergeUsers relation moves)', async () => {
    await prisma.invitation.create({ data: { id: 'i1', linkedUserId: 'u1', claimedAt: '2026-01-01' } });
    await prisma.invitation.create({ data: { id: 'i2', linkedUserId: 'u2', claimedAt: '2026-01-01' } });

    const result = await prisma.invitation.updateMany({
      where: { linkedUserId: 'u1' },
      data: { linkedUserId: null, claimedAt: null },
    });

    expect(result.count).toBe(1);

    const i1 = await prisma.invitation.findUnique({ where: { id: 'i1' } });
    const i2 = await prisma.invitation.findUnique({ where: { id: 'i2' } });
    expect(i1?.linkedUserId).toBeNull();
    expect(i1?.claimedAt).toBeNull();
    expect(i2?.linkedUserId).toBe('u2');
  });
});

describe('deleteMany — optional where support', () => {
  it('deletes only matching docs when a where clause is given', async () => {
    await prisma.telemetryEvent.create({ data: { id: 'e1', name: 'keep' } });
    await prisma.telemetryEvent.create({ data: { id: 'e2', name: 'remove' } });

    await prisma.telemetryEvent.deleteMany({ where: { name: 'remove' } });

    const remaining = await prisma.telemetryEvent.findMany();
    expect(remaining.map((e: any) => e.id)).toEqual(['e1']);
  });

  it('deletes everything when called with no args (unchanged prior behavior)', async () => {
    await prisma.telemetryEvent.create({ data: { id: 'e1', name: 'a' } });
    await prisma.telemetryEvent.create({ data: { id: 'e2', name: 'b' } });

    await prisma.telemetryEvent.deleteMany();

    const remaining = await prisma.telemetryEvent.findMany();
    expect(remaining).toHaveLength(0);
  });
});
