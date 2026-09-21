import { describe, expect, it } from 'vitest';
import { decideStudySession } from '../lib/studySessionDecision.js';

const STUDY = 'qualtrics_prolific';

function session(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'a',
    studySource: STUDY,
    status: 'ACTIVE',
    endedAt: null as Date | string | null,
    startedAt: '2026-09-01T10:00:00.000Z',
    ...over,
  };
}

describe('decideStudySession', () => {
  it('creates a session when the participant has none', () => {
    expect(decideStudySession([]).kind).toBe('create');
  });

  it('resumes a conversation still in progress', () => {
    const live = session({ id: 'live' });
    const decision = decideStudySession([live]);
    expect(decision).toEqual({ kind: 'resume', session: live });
  });

  it('blocks a second conversation once the first has finished', () => {
    const done = session({ id: 'done', status: 'COMPLETED', endedAt: '2026-09-01T10:06:00.000Z' });
    const decision = decideStudySession([done]);
    expect(decision).toEqual({ kind: 'blocked', session: done });
  });

  it('treats an end timestamp as finished even if the status was never moved off ACTIVE', () => {
    // Defensive: the two are written together today, but a half-written session
    // must not become a licence to start a second conversation.
    const done = session({ id: 'stale', status: 'ACTIVE', endedAt: '2026-09-01T10:06:00.000Z' });
    expect(decideStudySession([done]).kind).toBe('blocked');
  });

  it('treats any non-ACTIVE status as finished', () => {
    for (const status of ['COMPLETED', 'ABANDONED', 'EXPIRED', '', null]) {
      expect(decideStudySession([session({ status, endedAt: null })]).kind).toBe('blocked');
    }
  });

  it('prefers a live conversation over an earlier finished one', () => {
    const done = session({
      id: 'done',
      status: 'COMPLETED',
      endedAt: '2026-09-01T10:06:00.000Z',
      startedAt: '2026-09-01T10:00:00.000Z',
    });
    const live = session({ id: 'live', startedAt: '2026-09-01T10:07:00.000Z' });
    expect(decideStudySession([done, live])).toEqual({ kind: 'resume', session: live });
    // order of the input must not matter
    expect(decideStudySession([live, done])).toEqual({ kind: 'resume', session: live });
  });

  it('picks the newest of several live sessions', () => {
    const older = session({ id: 'older', startedAt: '2026-09-01T10:00:00.000Z' });
    const newer = session({ id: 'newer', startedAt: '2026-09-01T11:00:00.000Z' });
    expect(decideStudySession([older, newer])).toMatchObject({ session: { id: 'newer' } });
    expect(decideStudySession([newer, older])).toMatchObject({ session: { id: 'newer' } });
  });

  it('reports the newest finished session, whose post-survey link is the live one', () => {
    const first = session({
      id: 'first',
      status: 'COMPLETED',
      endedAt: '2026-09-01T10:06:00.000Z',
      startedAt: '2026-09-01T10:00:00.000Z',
    });
    const second = session({
      id: 'second',
      status: 'COMPLETED',
      endedAt: '2026-09-01T11:06:00.000Z',
      startedAt: '2026-09-01T11:00:00.000Z',
    });
    expect(decideStudySession([first, second])).toMatchObject({
      kind: 'blocked',
      session: { id: 'second' },
    });
  });

  it('ignores sessions that are not study sessions', () => {
    // The lookup is by participant id, but a non-study session under the same
    // id must neither be resumed nor block the study conversation.
    const practice = session({ id: 'practice', studySource: null });
    const staff = session({ id: 'staff', studySource: 'staff_quickstart' });
    expect(decideStudySession([practice, staff]).kind).toBe('create');
  });

  it('does not let an unparseable startedAt decide the outcome', () => {
    const good = session({ id: 'good', startedAt: '2026-09-01T10:00:00.000Z' });
    const broken = session({ id: 'broken', startedAt: 'not a date' });
    expect(decideStudySession([broken, good])).toMatchObject({ session: { id: 'good' } });
  });

  it('reproduces the two August 2026 duplicate pairs as blocked', () => {
    // R_54a0LwOYyWIIcV3: finished at 20:14:42, link reopened 15s later.
    const firstAttempt = session({
      id: 's3O6C1gVBhG3ZiKrBhil',
      status: 'COMPLETED',
      endedAt: '2026-08-14T20:14:42.534Z',
      startedAt: '2026-08-14T20:08:30.099Z',
    });
    expect(decideStudySession([firstAttempt])).toMatchObject({
      kind: 'blocked',
      session: { id: 's3O6C1gVBhG3ZiKrBhil' },
    });
  });
});
