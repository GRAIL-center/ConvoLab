import type { DocumentData, DocumentSnapshot, Firestore, Timestamp } from '@google-cloud/firestore';
import type { ConversationSession, Message } from '@workspace/database';
import { getFirestoreClient } from '@workspace/database';

const SESSION_COLLECTION = 'conversationSessions';
const MESSAGE_COLLECTION = 'messages';

type MessageCreateData = Omit<Message, 'id' | 'sessionId'> & {
  id?: string;
  sessionId?: string | number;
};

export interface CompletionResult {
  completed: boolean;
  endedAt: Date;
  durationSeconds: number;
}

function asDate(value: Date | Timestamp | undefined, field: string): Date {
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === 'function') return value.toDate();
  throw new Error(`Session ${field} is missing or invalid`);
}

function snapshotData(snapshot: DocumentSnapshot<DocumentData>, entity: string): DocumentData {
  if (!snapshot.exists) throw new Error(`${entity} not found`);
  return snapshot.data() ?? {};
}

/**
 * Stores a message and increments its session counter in one transaction.
 * The callback contains only Firestore reads and writes because it may retry.
 */
export async function createMessageAndIncrementSession(
  sessionId: string,
  data: MessageCreateData,
  firestore: Firestore = getFirestoreClient()
): Promise<string> {
  const sessionRef = firestore.collection(SESSION_COLLECTION).doc(String(sessionId));
  const messageRef = data.id
    ? firestore.collection(MESSAGE_COLLECTION).doc(String(data.id))
    : firestore.collection(MESSAGE_COLLECTION).doc();

  await firestore.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    const session = snapshotData(sessionSnapshot, 'Session');
    if (session.endedAt || session.status === 'COMPLETED') {
      throw new Error('Cannot add a message to a completed session');
    }
    const totalMessages = typeof session.totalMessages === 'number' ? session.totalMessages : 0;
    const { id: _id, ...messageData } = data;
    const payload = {
      ...messageData,
      sessionId,
      conversationSessionId: sessionId,
      timestamp: data.timestamp ?? new Date(),
    };

    transaction.create(messageRef, payload);
    transaction.update(sessionRef, { totalMessages: totalMessages + 1 });
  });

  return messageRef.id;
}

/**
 * Completes a session exactly once. Repeated calls retain the original
 * completion timestamp and duration.
 */
export async function completeSession(
  sessionId: string,
  completedAt: Date,
  firestore: Firestore = getFirestoreClient()
): Promise<CompletionResult> {
  const sessionRef = firestore.collection(SESSION_COLLECTION).doc(String(sessionId));

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(sessionRef);
    const session = snapshotData(snapshot, 'Session');

    if (session.endedAt) {
      return {
        completed: false,
        endedAt: asDate(session.endedAt, 'endedAt'),
        durationSeconds:
          typeof session.durationSeconds === 'number'
            ? session.durationSeconds
            : Math.round(
                (asDate(session.endedAt, 'endedAt').getTime() -
                  asDate(session.startedAt, 'startedAt').getTime()) /
                  1000
              ),
      };
    }

    const startedAt = asDate(session.startedAt, 'startedAt');
    const durationSeconds = Math.max(
      0,
      Math.round((completedAt.getTime() - startedAt.getTime()) / 1000)
    );

    transaction.update(sessionRef, {
      status: 'COMPLETED',
      endedAt: completedAt,
      durationSeconds,
    });

    return { completed: true, endedAt: completedAt, durationSeconds };
  });
}

/**
 * Status changes use a transaction so concurrent transitions cannot silently
 * overwrite one another. Completion must go through completeSession.
 */
export async function updateSessionAtomically(
  sessionId: string,
  data: Partial<ConversationSession>,
  firestore: Firestore = getFirestoreClient()
): Promise<ConversationSession> {
  if ('endedAt' in data || 'durationSeconds' in data) {
    throw new Error('Session completion fields must be updated with completeSession');
  }

  const sessionRef = firestore.collection(SESSION_COLLECTION).doc(String(sessionId));
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(sessionRef);
    const current = snapshotData(snapshot, 'Session');
    transaction.update(sessionRef, data as DocumentData);
    return {
      id: snapshot.id,
      ...current,
      ...data,
    } as ConversationSession;
  });
}
