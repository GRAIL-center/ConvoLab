import { Role } from '@workspace/database';
import { beforeEach, describe, expect, it } from 'vitest';
import { studyRouter } from '../trpc/routers/study.js';
import { testPrisma } from './setup.js';

const enterInput = {
  pid: 'prolific-pid-1',
  topic: 'Healthcare' as const,
  condition: '1' as const,
  partner: '0' as const,
  ideology: '0' as const,
};

function makeContext(userId: string | null) {
  const setCalls: Array<[string, unknown]> = [];
  const log = { info() {}, warn() {}, error() {} };
  return {
    setCalls,
    caller: studyRouter.createCaller({
      userId,
      prisma: testPrisma,
      firestore: null as never,
      req: {
        log,
        ip: '203.0.113.50',
        headers: {},
        session: {
          set(key: string, value: unknown) {
            setCalls.push([key, value]);
          },
        },
      } as never,
      res: {} as never,
    }),
  };
}

describe('study.enter session ownership', () => {
  let ownerId: string;

  beforeEach(async () => {
    const owner = await testPrisma.user.create({ data: { role: Role.GUEST } });
    ownerId = owner.id;
    await testPrisma.conversationSession.create({
      data: {
        id: 'study-session-1',
        userId: owner.id,
        status: 'ACTIVE',
        studySource: 'qualtrics_prolific',
        prolificPid: enterInput.pid,
        studyTopic: 'Healthcare',
        customPartnerPersona: 'Alex',
        studyPartnerOpens: false,
      } as never,
    });
  });

  it('switches a mismatched cookie to the study session owner (does not block the participant)', async () => {
    // A participant who practiced or signed in first carries a different
    // cookie. We cannot lock them out of their own study session, so the
    // capability link adopts the session's owner (Hanna, PR #277).
    const other = await testPrisma.user.create({ data: { role: Role.USER } });
    const { caller, setCalls } = makeContext(other.id);

    const result = await caller.enter(enterInput);

    expect(result.sessionId).toBe('study-session-1');
    expect(result.alreadyExisted).toBe(true);
    expect(setCalls).toEqual([['userId', ownerId]]);
  });

  it('resumes a cookieless caller onto the session owner', async () => {
    const { caller, setCalls } = makeContext(null);
    const result = await caller.enter(enterInput);

    expect(result.sessionId).toBe('study-session-1');
    expect(result.alreadyExisted).toBe(true);
    expect(setCalls).toEqual([['userId', ownerId]]);
  });

  it('resumes the owner without rewriting the cookie', async () => {
    const { caller, setCalls } = makeContext(ownerId);
    const result = await caller.enter(enterInput);

    expect(result.sessionId).toBe('study-session-1');
    expect(result.alreadyExisted).toBe(true);
    expect(setCalls).toEqual([]);
  });
});
