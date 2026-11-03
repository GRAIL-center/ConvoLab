// Safe by construction: run only via `vitest.safe.config.ts` (no real
// Firestore project). Same pattern as users.safe.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeFirestore } from '../../../../database/src/__tests__/fakeFirestore';

const fakeDb = new FakeFirestore();

vi.mock('../../../../database/src/firestoreClient', () => ({
  getFirestoreClient: () => fakeDb,
}));

const { prisma } = await import('../../../../database/index');
const { deleteAccountData } = await import('../accountDeletion');

const firestore = fakeDb as never;

async function seedPracticeSession(id: string, userId: string) {
  await prisma.conversationSession.create({ data: { id, userId, status: 'COMPLETED' } });
  await prisma.message.create({
    data: { id: `${id}-m1`, sessionId: id, role: 'user', content: 'hi' },
  });
  await prisma.message.create({
    data: {
      id: `${id}-m2`,
      sessionId: id,
      role: 'user',
      content: 'a private coach question',
      messageType: 'aside',
    },
  });
  await prisma.lappScore.create({ data: { id: `${id}-s1`, sessionId: id, turnNumber: 1 } });
  await prisma.observationNote.create({ data: { id: `${id}-n1`, sessionId: id, content: 'note' } });
  await prisma.usageLog.create({
    data: { id: `${id}-u1`, sessionId: id, userId, inputTokens: 10 },
  });
}

beforeEach(() => {
  (fakeDb as any).collections = new Map();
});

describe('deleteAccountData', () => {
  it('deletes the account, every practice conversation and everything hanging off it', async () => {
    await prisma.user.create({ data: { id: 'u1', role: 'USER', name: 'Ada' } });
    await prisma.contactMethod.create({
      data: { id: 'c1', userId: 'u1', type: 'email', value: 'ada@x.com' },
    });
    await prisma.externalIdentity.create({
      data: { id: 'e1', userId: 'u1', provider: 'google', externalId: 'sub1' },
    });
    await seedPracticeSession('s1', 'u1');
    await seedPracticeSession('s2', 'u1');

    const result = await deleteAccountData('u1', prisma, firestore);

    expect(result).toEqual({ sessionsDeleted: 2, messagesDeleted: 4, studySessionsKept: 0 });
    expect(await prisma.user.findUnique({ where: { id: 'u1' } })).toBeNull();
    expect(await prisma.contactMethod.findMany({ where: { userId: 'u1' } })).toHaveLength(0);
    expect(await prisma.externalIdentity.findMany({ where: { userId: 'u1' } })).toHaveLength(0);
    expect(await prisma.conversationSession.findMany({ where: { userId: 'u1' } })).toHaveLength(0);
    for (const sessionId of ['s1', 's2']) {
      expect(await prisma.message.findMany({ where: { sessionId } })).toHaveLength(0);
      expect(await prisma.lappScore.findMany({ where: { sessionId } })).toHaveLength(0);
      expect(await prisma.observationNote.findMany({ where: { sessionId } })).toHaveLength(0);
      expect(await prisma.usageLog.findMany({ where: { sessionId } })).toHaveLength(0);
    }
  });

  it('keeps study sessions, which the study protocol governs', async () => {
    await prisma.user.create({ data: { id: 'u1', role: 'GUEST' } });
    await seedPracticeSession('practice', 'u1');
    await prisma.conversationSession.create({
      data: { id: 'study', userId: 'u1', studySource: 'qualtrics_prolific' },
    });
    await prisma.message.create({
      data: { id: 'study-m1', sessionId: 'study', role: 'user', content: 'study turn' },
    });

    const result = await deleteAccountData('u1', prisma, firestore);

    expect(result.studySessionsKept).toBe(1);
    expect(await prisma.conversationSession.findUnique({ where: { id: 'study' } })).not.toBeNull();
    expect(await prisma.message.findMany({ where: { sessionId: 'study' } })).toHaveLength(1);
    expect(await prisma.conversationSession.findUnique({ where: { id: 'practice' } })).toBeNull();
  });

  it('unlinks claimed invitations, anonymises feedback and clears native sign-in records', async () => {
    await prisma.user.create({ data: { id: 'u1', role: 'GUEST' } });
    await prisma.invitation.create({ data: { id: 'i1', token: 't', linkedUserId: 'u1' } });
    await prisma.feedback.create({ data: { id: 'f1', userId: 'u1', rating: 4 } });
    await fakeDb.collection('authTickets').doc('tk').set({ guestUserId: 'u1' });
    await fakeDb.collection('authCodes').doc('cd1').set({ userId: 'u1' });
    await fakeDb.collection('authCodes').doc('cd2').set({ userId: 'other', guestUserId: 'u1' });

    await deleteAccountData('u1', prisma, firestore);

    const invitation = await prisma.invitation.findUnique({ where: { id: 'i1' } });
    expect(invitation).not.toBeNull();
    expect(invitation?.linkedUserId).toBeNull();
    const feedback = await prisma.feedback.findUnique({ where: { id: 'f1' } });
    expect(feedback).not.toBeNull();
    expect(feedback?.userId).toBeNull();
    expect((await fakeDb.collection('authTickets').get()).size).toBe(0);
    expect((await fakeDb.collection('authCodes').get()).size).toBe(0);
  });

  it("leaves other people's data alone", async () => {
    await prisma.user.create({ data: { id: 'u1', role: 'USER' } });
    await prisma.user.create({ data: { id: 'u2', role: 'USER' } });
    await seedPracticeSession('mine', 'u1');
    await seedPracticeSession('theirs', 'u2');
    await fakeDb.collection('authCodes').doc('theirs').set({ userId: 'u2' });

    await deleteAccountData('u1', prisma, firestore);

    expect(await prisma.user.findUnique({ where: { id: 'u2' } })).not.toBeNull();
    expect(await prisma.conversationSession.findUnique({ where: { id: 'theirs' } })).not.toBeNull();
    expect(await prisma.message.findMany({ where: { sessionId: 'theirs' } })).toHaveLength(2);
    expect((await fakeDb.collection('authCodes').get()).size).toBe(1);
  });
  it('deletes invitations the user created and usage logs left without a session', async () => {
    await prisma.user.create({ data: { id: 'u1', role: 'USER' } });
    await prisma.invitation.create({
      data: { id: 'mine', token: 't1', createdById: 'u1', label: 'Staff quick-start: my scenario' },
    });
    await prisma.invitation.create({ data: { id: 'theirs', token: 't2', createdById: 'staff' } });
    await prisma.usageLog.create({ data: { id: 'orphan', sessionId: 'gone', userId: 'u1' } });

    await deleteAccountData('u1', prisma, firestore);

    expect(await prisma.invitation.findUnique({ where: { id: 'mine' } })).toBeNull();
    expect(await prisma.invitation.findUnique({ where: { id: 'theirs' } })).not.toBeNull();
    expect(await prisma.usageLog.findUnique({ where: { id: 'orphan' } })).toBeNull();
  });

  it('keeps everything attached to a study session', async () => {
    await prisma.user.create({ data: { id: 'u1', role: 'GUEST' } });
    await prisma.conversationSession.create({
      data: { id: 'study', userId: 'u1', studySource: 'qualtrics_prolific' },
    });
    await prisma.lappScore.create({ data: { id: 'study-s', sessionId: 'study', turnNumber: 1 } });
    await prisma.observationNote.create({
      data: { id: 'study-n', sessionId: 'study', content: 'n' },
    });
    await prisma.usageLog.create({ data: { id: 'study-u', sessionId: 'study', userId: 'u1' } });

    await deleteAccountData('u1', prisma, firestore);

    expect(await prisma.lappScore.findUnique({ where: { id: 'study-s' } })).not.toBeNull();
    expect(await prisma.observationNote.findUnique({ where: { id: 'study-n' } })).not.toBeNull();
    expect(await prisma.usageLog.findUnique({ where: { id: 'study-u' } })).not.toBeNull();
  });
});
