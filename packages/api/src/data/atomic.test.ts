import type { Firestore } from '@google-cloud/firestore';
import { describe, expect, it } from 'vitest';
import { completeSession, createMessageAndIncrementSession } from './atomic.js';

interface Ref {
  id: string;
  path: string;
}

class InMemoryFirestore {
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

function asFirestore(fake: InMemoryFirestore): Firestore {
  return fake as unknown as Firestore;
}

describe('Firestore atomic session operations', () => {
  it('does not lose concurrent totalMessages increments', async () => {
    const fake = new InMemoryFirestore();
    fake.seed('conversationSessions/session-1', { totalMessages: 0 });

    await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        createMessageAndIncrementSession(
          'session-1',
          {
            id: `message-${index}`,
            role: 'user',
            content: `message ${index}`,
          } as never,
          asFirestore(fake)
        )
      )
    );

    expect(fake.read('conversationSessions/session-1')?.totalMessages).toBe(25);
    expect(fake.countCollection('messages')).toBe(25);
  });

  it('stores the message and session metadata update together', async () => {
    const fake = new InMemoryFirestore();
    fake.seed('conversationSessions/session-1', { totalMessages: 4 });

    await createMessageAndIncrementSession(
      'session-1',
      { id: 'message-1', role: 'partner', content: 'hello' } as never,
      asFirestore(fake)
    );

    expect(fake.read('messages/message-1')).toMatchObject({
      sessionId: 'session-1',
      conversationSessionId: 'session-1',
      role: 'partner',
    });
    expect(fake.read('conversationSessions/session-1')?.totalMessages).toBe(5);
  });

  it('leaves no partial message when the transaction commit fails', async () => {
    const fake = new InMemoryFirestore();
    fake.seed('conversationSessions/session-1', { totalMessages: 2 });
    fake.failCommit = true;

    await expect(
      createMessageAndIncrementSession(
        'session-1',
        { id: 'message-1', role: 'user', content: 'hello' } as never,
        asFirestore(fake)
      )
    ).rejects.toThrow('injected commit failure');

    expect(fake.read('messages/message-1')).toBeUndefined();
    expect(fake.read('conversationSessions/session-1')?.totalMessages).toBe(2);
  });

  it('does not add messages after a concurrent completion wins', async () => {
    const fake = new InMemoryFirestore();
    fake.seed('conversationSessions/session-1', {
      status: 'ACTIVE',
      startedAt: new Date('2026-07-30T12:00:00.000Z'),
      endedAt: null,
      durationSeconds: null,
      totalMessages: 0,
    });

    await completeSession('session-1', new Date('2026-07-30T12:01:00.000Z'), asFirestore(fake));

    await expect(
      createMessageAndIncrementSession(
        'session-1',
        { id: 'late-message', role: 'user', content: 'too late' } as never,
        asFirestore(fake)
      )
    ).rejects.toThrow('Cannot add a message to a completed session');
    expect(fake.read('messages/late-message')).toBeUndefined();
    expect(fake.read('conversationSessions/session-1')?.totalMessages).toBe(0);
  });

  it('atomically completes a session', async () => {
    const fake = new InMemoryFirestore();
    const startedAt = new Date('2026-07-30T12:00:00.000Z');
    const endedAt = new Date('2026-07-30T12:01:30.000Z');
    fake.seed('conversationSessions/session-1', {
      status: 'ACTIVE',
      startedAt,
      endedAt: null,
      durationSeconds: null,
    });

    const result = await completeSession('session-1', endedAt, asFirestore(fake));

    expect(result).toEqual({ completed: true, endedAt, durationSeconds: 90 });
    expect(fake.read('conversationSessions/session-1')).toMatchObject({
      status: 'COMPLETED',
      endedAt,
      durationSeconds: 90,
    });
  });

  it('keeps the original completion values on repeated completion', async () => {
    const fake = new InMemoryFirestore();
    const startedAt = new Date('2026-07-30T12:00:00.000Z');
    const firstEnd = new Date('2026-07-30T12:01:00.000Z');
    fake.seed('conversationSessions/session-1', {
      status: 'ACTIVE',
      startedAt,
      endedAt: null,
      durationSeconds: null,
    });

    await completeSession('session-1', firstEnd, asFirestore(fake));
    const repeated = await completeSession(
      'session-1',
      new Date('2026-07-30T12:05:00.000Z'),
      asFirestore(fake)
    );

    expect(repeated).toEqual({
      completed: false,
      endedAt: firstEnd,
      durationSeconds: 60,
    });
    expect(fake.read('conversationSessions/session-1')).toMatchObject({
      endedAt: firstEnd,
      durationSeconds: 60,
    });
  });

  it('leaves all completion fields unchanged when commit fails', async () => {
    const fake = new InMemoryFirestore();
    fake.seed('conversationSessions/session-1', {
      status: 'ACTIVE',
      startedAt: new Date('2026-07-30T12:00:00.000Z'),
      endedAt: null,
      durationSeconds: null,
    });
    fake.failCommit = true;

    await expect(
      completeSession('session-1', new Date('2026-07-30T12:01:00.000Z'), asFirestore(fake))
    ).rejects.toThrow('injected commit failure');

    expect(fake.read('conversationSessions/session-1')).toMatchObject({
      status: 'ACTIVE',
      endedAt: null,
      durationSeconds: null,
    });
  });
});
