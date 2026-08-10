/**
 * Quality gate for synthetic conversations, run on every generated record so
 * degraded batches are caught at generation time (bug F7 went unnoticed for a
 * day because nothing checked the output). Issues are stamped into the JSONL
 * as `quality_issues`; the batch script quarantines records that have any.
 */

interface RecordTurn {
  role?: string;
  type?: string;
  content?: string;
  lapp?: unknown;
}

const PLACEHOLDER = /\[[A-Za-z][^\]]{1,40}\]/; // "[Relative's Name]", "[Name]" etc.
const SENTENCE_END = /[.!?…"'’”)\]]$/;
// A turn ending on a function word or hanging comma is cut mid-thought no
// matter how short it is ("I've been thinking a", "the news being a lot,")
const DANGLING_END =
  /(\b(a|an|the|and|or|but|to|of|in|on|at|for|with|that|this|it|is|are|was|were|be|about|my|your|his|her|their|so|if|when|how|what|i|you|we|they)|[,;:—-])$/i;

export function validateConversationRecord(record: Record<string, unknown>): string[] {
  const issues: string[] = [];
  const turns = (record.turns as RecordTurn[] | undefined) ?? [];
  const main = turns.filter((t) => (t.type ?? 'main') === 'main');
  const expectedUserTurns = Number(record.n_user_turns_main ?? 0);

  let userIndex = 0;
  let prevContent = '';
  for (const t of main) {
    const role = t.role ?? '?';
    const content = (t.content ?? '').trim();
    if (role === 'user') userIndex += 1;
    const where = `${role} turn ${role === 'user' ? userIndex : ''}`.trim();

    if (!content) {
      issues.push(`${where}: empty content`);
      continue;
    }
    if (content.length < 20) {
      issues.push(`${where}: suspiciously short (${content.length} chars)`);
    }
    if (PLACEHOLDER.test(content)) {
      issues.push(`${where}: contains placeholder brackets`);
    }
    // Truncation heuristic: no terminal punctuation AND (long, or ends on a
    // dangling function word / hanging comma)
    if (!SENTENCE_END.test(content) && (content.length > 60 || DANGLING_END.test(content))) {
      issues.push(`${where}: possibly truncated (no terminal punctuation)`);
    }
    if (content === prevContent) {
      issues.push(`${where}: identical to previous turn (degenerate loop)`);
    }
    prevContent = content;
  }

  const userTurns = main.filter((t) => t.role === 'user');
  if (userTurns.length !== expectedUserTurns) {
    issues.push(`expected ${expectedUserTurns} user turns, found ${userTurns.length}`);
  }

  // LAPP coverage: user turns after the first should carry scores. The pipeline
  // deliberately skips a turn's score when the scorer call fails (no fabricated
  // fallback — scorer-hardening decision, Aug 2026), so tolerate one gap and
  // flag only the systematic case.
  const scored = userTurns.filter((t) => t.lapp).length;
  const expectedScored = Math.max(0, userTurns.length - 1);
  if (scored < expectedScored - 1) {
    issues.push(`only ${scored}/${expectedScored} user turns have LAPP scores`);
  }

  // Coach coverage: coach runs from turn 2 on; allow one legitimate drop
  const coachTurns = main.filter((t) => t.role === 'coach').length;
  if (coachTurns < expectedScored - 1) {
    issues.push(`only ${coachTurns}/${expectedScored} coach messages`);
  }

  return issues;
}
