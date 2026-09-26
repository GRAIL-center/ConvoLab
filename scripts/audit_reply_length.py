#!/usr/bin/env python3
"""
Offline audit of partner reply length in a de-identified transcript export.

This is the OUTPUT-LEVEL half of the partner register check. The study
partner must answer in 1 to 3 sentences (4 at most). The PROMPT-LEVEL half is
the unit test packages/api/src/__tests__/partnerReplyLength.safe.test.ts, which
proves the rule (PARTNER_RESPONSE_POLICY) reaches every final partner prompt;
this script measures whether real replies actually follow it. No model calls.

Input: JSONL written by scripts/export_transcripts_firestore.py, one session
per line, with `turns` = list of {role, content, type?, timestamp}, a `study`
block or null, `started_at`, `partner_persona`, `scenario_slug`, `session_id`.

Only partner main-thread turns count (role "partner", type "main" or missing).

Sentence rule: a sentence ends at a run of `.`, `!` or `?` (optionally
followed by closing quotes or brackets) that is followed by whitespace or the
end of the text, so "..." or "?!" is one terminator. Empty segments are
ignored; a non-empty reply with no terminator is one sentence. Abbreviations
such as "U.S. " or "Mr. " are counted as terminators (the rule is deliberately
simple, so it slightly over-counts). Words are whitespace-separated tokens.

Periods (by session `started_at`, UTC, cut at 00:00):
  P1 <2026-08-25            before the reply-length policy shipped
  P2 2026-08-25..09-04      policy live, pilot persona names
  P3 2026-09-05..09-19      Mark/Megan Johnson rename
  P4 >=2026-09-20           V3 personas

Study sessions are created without a scenario, so their scenario_slug is null;
they are grouped as "study:<partner_ideology>-<partner_gender>" from the study
block instead.

Output never contains message text: only counts, session ids and turn indices.

Usage:
    python3 scripts/audit_reply_length.py EXPORT.jsonl [--first-reply-only]
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timezone

TERMINATOR = re.compile(r"[.!?…]+[\"'”’)\]]*(?=\s|$)")

PERIODS = [
    ("P1 pre-policy (<08-25)", None, "2026-08-25"),
    ("P2 policy (08-25..09-04)", "2026-08-25", "2026-09-05"),
    ("P3 rename (09-05..09-19)", "2026-09-05", "2026-09-20"),
    ("P4 V3 (>=09-20)", "2026-09-20", None),
]


def count_sentences(text: str) -> int:
    return sum(1 for seg in TERMINATOR.split(text or "") if seg.strip())


def count_words(text: str) -> int:
    return len((text or "").split())


def _utc(d: str) -> datetime:
    return datetime.fromisoformat(d).replace(tzinfo=timezone.utc)


def period_of(started_at: str | None) -> str:
    if not started_at:
        return "unknown"
    ts = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    for label, lo, hi in PERIODS:
        if (lo is None or ts >= _utc(lo)) and (hi is None or ts < _utc(hi)):
            return label
    return "unknown"


def slug_of(rec: dict) -> str:
    if rec.get("scenario_slug"):
        return rec["scenario_slug"]
    study = rec.get("study")
    if study:
        return f"study:{study.get('partner_ideology') or '?'}-{study.get('partner_gender') or '?'}"
    return "(none)"


def load_replies(path: str, first_only: bool) -> list[dict]:
    replies = []
    with open(path, encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, 1):
            if not line.strip():
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError as exc:
                sys.exit(f"line {line_no}: not JSON ({exc.msg})")
            period, slug = period_of(rec.get("started_at")), slug_of(rec)
            for idx, turn in enumerate(rec.get("turns") or []):
                if turn.get("role") != "partner" or (turn.get("type") or "main") != "main":
                    continue
                text = turn.get("content") or ""
                replies.append({
                    "session_id": rec.get("session_id", "?"),
                    "turn": idx,
                    "sentences": count_sentences(text),
                    "words": count_words(text),
                    "period": period,
                    "slug": slug,
                })
                if first_only:
                    break
    return replies


def _q(values: list[int]) -> tuple[float, float, float]:
    if not values:
        return (float("nan"),) * 3
    if len(values) == 1:
        v = float(values[0])
        return v, v, v
    q1, q2, q3 = statistics.quantiles(values, n=4, method="inclusive")
    return q2, q1, q3


def summary_row(label: str, rows: list[dict]) -> str:
    n = len(rows)
    s = [r["sentences"] for r in rows]
    w = [r["words"] for r in rows]
    pct = (lambda k: 100.0 * k / n) if n else (lambda k: float("nan"))
    ok = sum(1 for x in s if 1 <= x <= 3)
    four = sum(1 for x in s if x == 4)
    over = sum(1 for x in s if x >= 5)
    sm, s1, s3 = _q(s)
    wm, w1, w3 = _q(w)
    sess = len({r["session_id"] for r in rows})
    return (f"{label:<34} {sess:>4} {n:>4} {pct(ok):>6.0f}% {pct(four):>5.0f}% {pct(over):>5.0f}% "
            f"{sm:>5.1f} [{s1:>4.1f}-{s3:>4.1f}] {wm:>6.1f} [{w1:>5.1f}-{w3:>5.1f}]")


HEADER = (f"{'group':<34} {'sess':>4} {'n':>4} {'1-3':>7} {'4':>6} {'5+':>6} "
          f"{'sent':>5} {'[IQR]':>11} {'words':>6} {'[IQR]':>13}")


def table(title: str, groups: dict[str, list[dict]], order: list[str] | None = None) -> None:
    print(f"\n{title}")
    print(HEADER)
    print("-" * len(HEADER))
    for key in order or sorted(groups):
        if key in groups:
            print(summary_row(key, groups[key]))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("export", help="JSONL from export_transcripts_firestore.py")
    ap.add_argument("--first-reply-only", action="store_true",
                    help="only the partner's first main-thread reply per session")
    args = ap.parse_args()

    replies = load_replies(args.export, args.first_reply_only)
    sessions = {r["session_id"] for r in replies}
    scope = "first partner reply per session" if args.first_reply_only else "all partner main-thread replies"
    print(f"Partner reply length audit ({scope}); {len(replies)} replies from {len(sessions)} sessions")
    print("Columns: share of replies with 1-3 / exactly 4 / 5+ sentences; median [Q1-Q3] of sentences and words")

    table("OVERALL", {"all": replies})

    by_period: dict[str, list[dict]] = defaultdict(list)
    by_slug: dict[str, list[dict]] = defaultdict(list)
    for r in replies:
        by_period[r["period"]].append(r)
        by_slug[r["slug"]].append(r)
    table("BY PERSONA VERSION (session started_at)", by_period,
          [p[0] for p in PERIODS] + ["unknown"])
    table("BY SCENARIO", by_slug)

    print("\n10 LONGEST REPLIES BY SENTENCE COUNT (no text)")
    print(f"{'session_id':<40} {'turn':>4} {'sent':>5} {'words':>6}  period")
    for r in sorted(replies, key=lambda r: (-r["sentences"], -r["words"]))[:10]:
        print(f"{r['session_id']:<40} {r['turn']:>4} {r['sentences']:>5} {r['words']:>6}  {r['period']}")


if __name__ == "__main__":
    main()
