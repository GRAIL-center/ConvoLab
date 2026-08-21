#!/usr/bin/env python3
"""
Export ConvoLab conversation transcripts from Firestore to local JSONL,
de-identified, for development of the DQI scorer.

This is the Firestore-era sibling of export_transcripts.py (which reads the
old Cloud SQL/Postgres instance holding the historical transcripts). Output
schema is identical, so DQI tooling can consume either file interchangeably.

------------------------------------------------------------------------------
BEFORE YOU RUN THIS: take a full backup
------------------------------------------------------------------------------
Before relying on any export (and certainly before deleting anything), take a
full Firestore export to a GCS bucket, download it, and store it per the IRB
protocol (Purdue Box or equivalent):

    gcloud config set project convolab-490517
    gcloud firestore export gs://convolab-490517-backups/firestore-$(date +%Y%m%d)
    gsutil -m cp -r gs://convolab-490517-backups/firestore-$(date +%Y%m%d) ~/Downloads/

(The bucket must exist and live in the same project; create it once with
`gsutil mb -l us-central1 gs://convolab-490517-backups`.)

------------------------------------------------------------------------------
USAGE
------------------------------------------------------------------------------
    pip install google-cloud-firestore
    gcloud auth application-default login   # needs read access to the project

    # See what's there before exporting anything
    python export_transcripts_firestore.py --stats

    # Export
    python export_transcripts_firestore.py --out ./dqi-devset-firestore-20260807.jsonl

Project defaults to convolab-490517; override with --project or
GOOGLE_CLOUD_PROJECT.

------------------------------------------------------------------------------
DE-IDENTIFICATION
------------------------------------------------------------------------------
Same rules as export_transcripts.py — the IRB protocol requires no direct
identifiers and user IDs replaced on download, so that happens here rather
than as a later cleanup step:

  - user IDs      -> stable salted-hash pseudonyms (participant_0001, ...)
  - users / externalIdentities / contactMethods collections -> never read
  - invitation labels ("Participant #7") -> excluded unless --keep-labels
  - Prolific PIDs -> NEVER written raw; only as a salted hash (see below)

The salt is random per run unless you pass --salt, so pseudonyms are NOT
stable across runs by default. Pass the same salt to keep them comparable
(including comparable with a Postgres export run with the same salt); store
that salt somewhere sensible if you need to re-link later, and treat it as
sensitive.

OUTPUT IS NOT FOR GIT. Add it to .gitignore before generating anything.

------------------------------------------------------------------------------
JOINING TRANSCRIPTS TO QUALTRICS SURVEY DATA
------------------------------------------------------------------------------
A two-arm RCT needs each transcript linked to that participant's survey
outcomes. The link field is the Prolific PID, which is a direct identifier and
must not appear in the export.

Instead every record carries `survey_join_key`: sha256(salt + prolific_pid),
truncated to 16 hex chars. Compute the same key over the PID column of the
Qualtrics export, using THE SAME --salt, and join on it. Neither file then
contains the raw PID.

    python export_transcripts_firestore.py --salt "$CONVOLAB_JOIN_SALT" --out ...

The salt is the re-identification key: store it wherever the IRB protocol says
identifiers go (not beside the exported data, not in git). Lose it and the
transcripts can never be joined to the survey again — which is the intended
property, so decide deliberately.

Note `participant_NNNN` pseudonyms are sequential and therefore export-order
dependent. They are readable labels, NOT join keys. Always join on
`survey_join_key`.
"""

import argparse
import hashlib
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import date, datetime

try:
    from google.cloud import firestore
except ImportError:
    sys.exit("pip install google-cloud-firestore")

DEFAULT_PROJECT = "convolab-490517"


def client_from_args(args):
    project = args.project or os.environ.get("GOOGLE_CLOUD_PROJECT", DEFAULT_PROJECT)
    return firestore.Client(project=project)


def jsonable(v):
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, date):
        return v.isoformat()
    return v


def pseudonym(raw_id, salt, cache, counter):
    if raw_id is None:
        return None
    raw_id = str(raw_id)
    if raw_id not in cache:
        counter[0] += 1
        # hash is belt-and-braces; the sequential label is what actually appears
        hashlib.sha256((salt + raw_id).encode()).hexdigest()
        cache[raw_id] = f"participant_{counter[0]:04d}"
    return cache[raw_id]


def survey_join_key(prolific_pid, salt):
    """Deterministic pseudonym for joining to the Qualtrics export.

    Unlike pseudonym(), this is a pure function of (salt, pid), so the same
    participant gets the same key in any file built with the same salt. That
    is what makes the transcript/survey join possible without either file
    carrying the raw Prolific PID.
    """
    if not prolific_pid:
        return None
    return hashlib.sha256((salt + str(prolific_pid)).encode()).hexdigest()[:16]


# Study fields written by the Qualtrics/Prolific flow (api trpc/routers/study.ts).
# Firestore field -> exported name. Without these a transcript cannot be
# assigned to an arm, which makes the RCT unanalysable.
STUDY_FIELDS = {
    "studySource": "source",
    "studyCondition": "condition",                 # 0 = control, 1 = coaching
    "studyConditionLabel": "condition_label",
    "studyCoachEnabled": "coach_enabled",
    "studyTopic": "topic",
    "studyOwnTopic": "own_topic",
    "studyParticipantParty": "participant_party",
    "studyParticipantIdeology": "participant_ideology",
    "studyPartnerIdeology": "partner_ideology",
    "studyPartnerIdeologyCode": "partner_ideology_code",
    "studyPartnerIdeologyRandomized": "partner_ideology_randomized",
    "studyPartnerGender": "partner_gender",
    "studyPartnerGenderCode": "partner_gender_code",
    "studyEnteredAt": "entered_at",
    # entered_at is stamped at Qualtrics entry; conversation_started_at is stamped
    # when the participant actually opens the conversation socket. The gap between
    # them is landing-page reading time, which is not conversation dosage.
    "studyConversationStartedAt": "conversation_started_at",
    # Set when the participant is sent back to Qualtrics. end_type separates a
    # completed conversation from a hard-stop or an abandonment, so it carries
    # the attrition analysis; participant_turn_count is the dosage measure.
    # A record with entered_at but no redirected_at is a dropout.
    "studyEndType": "end_type",
    "studyRedirectedAt": "redirected_at",
    "participantTurnCount": "participant_turn_count",
}


def study_block(s):
    """Study/RCT metadata for a session, or None for a non-study session."""
    if not s.get("studySource"):
        return None
    return {out: jsonable(s.get(src)) for src, out in STUDY_FIELDS.items()}


def load_collection(db, name):
    """Return {doc_id: fields} for a whole collection."""
    out = {}
    for snap in db.collection(name).stream():
        out[snap.id] = snap.to_dict() or {}
    return out


def msg_sort_key(m):
    ts = m.get("timestamp")
    key = ts.isoformat() if isinstance(ts, datetime) else ""  # missing ts sorts first
    return (key, str(m.get("_id", "")))


def group_messages(messages):
    by_session = defaultdict(list)
    for doc_id, m in messages.items():
        m = dict(m)
        m["_id"] = doc_id
        by_session[str(m.get("sessionId"))].append(m)
    for msgs in by_session.values():
        msgs.sort(key=msg_sort_key)
    return by_session


def show_stats(db):
    sessions = load_collection(db, "conversationSessions")
    messages = load_collection(db, "messages")
    lapp = load_collection(db, "lappScores")
    by_session = group_messages(messages)

    user_main = [
        m for m in messages.values()
        if m.get("role") == "user" and m.get("messageType", "main") == "main"
    ]
    asides = [m for m in messages.values() if m.get("messageType") == "aside"]
    users = {str(s.get("userId")) for s in sessions.values() if s.get("userId")}
    started = [s.get("startedAt") for s in sessions.values()
               if isinstance(s.get("startedAt"), datetime)]

    turns_per_session = Counter()
    for sid in sessions:
        n = sum(1 for m in by_session.get(str(sid), [])
                if m.get("role") == "user" and m.get("messageType", "main") == "main")
        turns_per_session[n] += 1

    rich = sum(c for n, c in turns_per_session.items() if n >= 2)

    print("\n--- firestore contents ---")
    print(f"  {'sessions total':32s} {len(sessions)}")
    print(f"  {'sessions with >=2 user turns':32s} {rich}")
    print(f"  {'messages total':32s} {len(messages)}")
    print(f"  {'  of which user/main':32s} {len(user_main)}")
    print(f"  {'  of which aside':32s} {len(asides)}")
    print(f"  {'lapp scores':32s} {len(lapp)}")
    print(f"  {'distinct users':32s} {len(users)}")
    print(f"  {'earliest session':32s} {min(started).isoformat() if started else '-'}")
    print(f"  {'latest session':32s} {max(started).isoformat() if started else '-'}")

    print("\n--- user turns per session (distribution) ---")
    for n in sorted(turns_per_session):
        c = turns_per_session[n]
        print(f"  {n:3d} user turns: {'#' * min(c, 50)} ({c})")
    print("\nSessions with very few turns are probably abandoned tests, "
          "not usable DQI development data. Use --min-turns to filter.\n")

    # Study/RCT breakdown. Worth eyeballing before an export: a lopsided arm
    # split or a pile of sessions with no condition means something upstream
    # (Qualtrics randomisation, the study entry route) is misbehaving, and it
    # is much cheaper to notice that now than after data collection closes.
    study = [s for s in sessions.values() if s.get("studySource")]
    print("--- study sessions ---")
    print(f"  {'study sessions':32s} {len(study)}")
    print(f"  {'non-study sessions':32s} {len(sessions) - len(study)}")
    if study:
        arms = Counter(str(s.get("studyCondition")) for s in study)
        label = {"0": "control", "1": "coaching"}
        for cond in sorted(arms):
            print(f"  {'  condition ' + cond + ' (' + label.get(cond, '?') + ')':32s} {arms[cond]}")
        missing = sum(1 for s in study if s.get("studyCondition") is None)
        if missing:
            print(f"  {'  !! NO CONDITION SET':32s} {missing}  <-- unanalysable")
        no_pid = sum(1 for s in study if not s.get("prolificPid"))
        if no_pid:
            print(f"  {'  !! no prolificPid':32s} {no_pid}  <-- cannot join to survey")
        for field, name in (("studyParticipantIdeology", "participant ideology"),
                            ("studyPartnerIdeology", "partner ideology")):
            dist = Counter(str(s.get(field)) for s in study)
            print(f"  {name}: " + ", ".join(f"{k}={v}" for k, v in sorted(dist.items())))
    print()


def export(db, args):
    salt = args.salt or os.urandom(16).hex()
    cache, counter = {}, [0]

    sessions = load_collection(db, "conversationSessions")
    scenarios = load_collection(db, "scenarios")
    invitations = load_collection(db, "invitations")
    by_session = group_messages(load_collection(db, "messages"))

    # lapp keyed by the user message it scores
    lapp = {}
    for sc in load_collection(db, "lappScores").values():
        if sc.get("userMessageId") is not None:
            lapp[str(sc["userMessageId"])] = sc

    written = skipped = 0
    with open(args.out, "w", encoding="utf-8") as fh:
        for sid in sorted(sessions, key=str):
            s = sessions[sid]
            if args.study_only and not s.get("studySource"):
                skipped += 1
                continue

            msgs = by_session.get(str(sid), [])
            main = [m for m in msgs if m.get("messageType", "main") == "main"]
            n_user = sum(1 for m in main if m.get("role") == "user")
            if n_user < args.min_turns:
                skipped += 1
                continue

            scenario = scenarios.get(str(s.get("scenarioId")), {})
            invitation = invitations.get(str(s.get("invitationId")), {})

            turns = []
            for m in msgs:
                t = {
                    "message_id": m["_id"],
                    "role": m.get("role"),                    # user | partner | coach
                    "type": m.get("messageType", "main"),     # main | aside
                    "content": m.get("content"),
                    "timestamp": jsonable(m.get("timestamp")),
                }
                if m.get("asideThreadId"):
                    t["aside_thread"] = m["asideThreadId"]
                sc = lapp.get(str(m["_id"]))
                if sc:
                    t["lapp"] = {"turn": sc.get("turnNumber"), "l": sc.get("l"),
                                 "a": sc.get("a"), "p": sc.get("p"),
                                 "pe": sc.get("pe"), "tone": sc.get("tone")}
                turns.append(t)

            rec = {
                "session_id": sid,
                "participant": pseudonym(s.get("userId"), salt, cache, counter),
                # Join key to the Qualtrics survey export. Never the raw PID.
                "survey_join_key": survey_join_key(s.get("prolificPid"), salt),
                "study": study_block(s),
                "scenario": scenario.get("name") or s.get("customScenarioName"),
                "scenario_slug": scenario.get("slug"),
                "partner_persona": s.get("customPartnerPersona")
                or scenario.get("partnerPersona"),
                "partner_model": scenario.get("partnerModel"),
                "coach_model": scenario.get("coachModel"),
                "status": s.get("status"),
                "started_at": jsonable(s.get("startedAt")),
                "ended_at": jsonable(s.get("endedAt")),
                "duration_seconds": s.get("durationSeconds"),
                "n_user_turns_main": n_user,
                "turns": turns,
            }
            if args.keep_labels:
                rec["invitation_label"] = invitation.get("label")
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
            written += 1

    print(f"\nwrote {written} sessions to {args.out}")
    print(f"skipped {skipped} with fewer than {args.min_turns} user turns")
    print(f"{counter[0]} distinct participants pseudonymised")
    if not args.salt:
        print("\nNOTE: random salt used, so pseudonyms will differ on the next run.")
        print("Pass --salt <value> if you need them stable across exports.")
    print("\nAdd this file to .gitignore. Store it per the IRB protocol.")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stats", action="store_true",
                    help="report what's in Firestore and exit")
    ap.add_argument("--out", default=f"dqi-devset-firestore-{date.today():%Y%m%d}.jsonl")
    ap.add_argument("--min-turns", type=int, default=2,
                    help="skip sessions with fewer user turns (default 2)")
    ap.add_argument("--study-only", action="store_true",
                    help="export only Qualtrics/Prolific study sessions "
                         "(excludes pilot and ad-hoc sessions)")
    ap.add_argument("--keep-labels", action="store_true",
                    help="include invitation labels (may identify participants)")
    ap.add_argument("--salt", help="fixed salt for stable pseudonyms across runs")
    ap.add_argument("--project", help=f"GCP project (default {DEFAULT_PROJECT})")
    args = ap.parse_args()

    db = client_from_args(args)
    if args.stats:
        show_stats(db)
        return
    export(db, args)


if __name__ == "__main__":
    main()
