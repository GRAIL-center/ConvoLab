/**
 * Which session a participant returning to the study link should get.
 *
 * Extracted from study.enter so the rule is reviewable and testable on its own:
 * it decides the participant's fate in a two-arm RCT, and it was wrong once
 * already. Until 21 Sep 2026 the router resumed only a session that was still
 * ACTIVE with no endedAt, and fell through to creating a new one otherwise. So
 * a participant who finished and reopened the link got a second conversation.
 * Two such pairs exist in the August 2026 test data. The transcript is the
 * H1/H3 outcome and the pre-analysis plan forbids post-hoc exclusions, so a
 * stray second transcript cannot be dropped after the fact.
 */

/** The fields of a stored session this decision depends on. */
export interface PriorStudySession {
  studySource?: string | null;
  status?: string | null;
  endedAt?: Date | string | null;
  startedAt?: Date | string | null;
}

export type StudySessionDecision<T> =
  /** In progress: hand back the same session so a refresh resumes it. */
  | { kind: 'resume'; session: T }
  /** Already finished: start nothing, send them on to the post-survey. */
  | { kind: 'blocked'; session: T }
  /** Nothing prior: create a session. */
  | { kind: 'create' };

function startedAtMs(session: PriorStudySession): number {
  const ms = new Date(String(session.startedAt ?? 0)).getTime();
  // An unparseable or absent startedAt sorts oldest rather than poisoning the
  // comparator, which would make the ordering arbitrary.
  return Number.isFinite(ms) ? ms : 0;
}

function isInProgress(session: PriorStudySession): boolean {
  return session.status === 'ACTIVE' && !session.endedAt;
}

export function decideStudySession<T extends PriorStudySession>(
  sessionsForParticipant: readonly T[]
): StudySessionDecision<T> {
  const priorStudySessions = sessionsForParticipant.filter(
    (session) => session.studySource === 'qualtrics_prolific'
  );
  const newestFirst = (a: T, b: T) => startedAtMs(b) - startedAtMs(a);

  // An in-progress session wins over a finished one: someone who finished an
  // earlier attempt and is now mid-conversation should land back in the live
  // one, not be told they are done.
  const inProgress = priorStudySessions.filter(isInProgress).sort(newestFirst)[0];
  if (inProgress) return { kind: 'resume', session: inProgress };

  const finished = priorStudySessions.filter((session) => !isInProgress(session)).sort(newestFirst)[0];
  if (finished) return { kind: 'blocked', session: finished };

  return { kind: 'create' };
}
