// Safe by construction: uses an in-memory fake Firestore and never touches
// real infrastructure.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeFirestore } from '../../../../database/src/__tests__/fakeFirestore';

const fakeDb = new FakeFirestore();

vi.mock('../../../../database/src/firestoreClient', () => ({
  getFirestoreClient: () => fakeDb,
}));

const { prisma } = await import('../../../../database/index');
const { deleteUserCascade } = await import('../users');

beforeEach(() => {
  (fakeDb as any).collections = new Map();
});

describe('deleteUserCascade', () => {
  it('deletes the user, their ContactMethods and ExternalIdentities, and nulls out their Feedback/TelemetryEvent userId', async () => {
    await prisma.user.create({ data: { id: 'u1', role: 'GUEST' } });
    await prisma.contactMethod.create({ data: { id: 'c1', userId: 'u1', type: 'email', value: 'a@b.com' } });
    await prisma.externalIdentity.create({ data: { id: 'e1', userId: 'u1', provider: 'google', externalId: 'sub1' } });
    await prisma.feedback.create({ data: { id: 'f1', userId: 'u1', rating: 5 } });
    await prisma.telemetryEvent.create({ data: { id: 't1', userId: 'u1', name: 'conversation_started' } });

    // A second, unrelated user's data must survive untouched.
    await prisma.user.create({ data: { id: 'u2', role: 'USER' } });
    await prisma.contactMethod.create({ data: { id: 'c2', userId: 'u2', type: 'email', value: 'x@y.com' } });

    await deleteUserCascade('u1', prisma);

    expect(await prisma.user.findUnique({ where: { id: 'u1' } })).toBeNull();
    expect(await prisma.contactMethod.findMany({ where: { userId: 'u1' } })).toHaveLength(0);
    expect(await prisma.externalIdentity.findMany({ where: { userId: 'u1' } })).toHaveLength(0);

    const feedback = await prisma.feedback.findUnique({ where: { id: 'f1' } });
    expect(feedback?.userId).toBeNull();
    expect(feedback).not.toBeNull(); // row survives, only userId is nulled

    const event = await prisma.telemetryEvent.findUnique({ where: { id: 't1' } });
    expect(event?.userId).toBeNull();

    // u2's data is untouched.
    expect(await prisma.user.findUnique({ where: { id: 'u2' } })).not.toBeNull();
    expect(await prisma.contactMethod.findMany({ where: { userId: 'u2' } })).toHaveLength(1);
  });
});
