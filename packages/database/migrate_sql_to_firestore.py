import os
import sys
import logging
from typing import Dict, List

import psycopg2
from psycopg2.extras import RealDictCursor
# pyrefly: ignore [missing-import]
from google.cloud import firestore
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s: %(message)s")


# ----------------------------
# SQL CONNECTION
# ----------------------------
def get_sql_connection():
    conn = psycopg2.connect(
        host=os.getenv("CLOUD_SQL_HOST"),
        port=int(os.getenv("CLOUD_SQL_PORT", 5432)),
        dbname=os.getenv("CLOUD_SQL_DATABASE"),
        user=os.getenv("CLOUD_SQL_USER"),
        password=os.getenv("CLOUD_SQL_PASSWORD"),
        sslmode="require",
        cursor_factory=RealDictCursor,
    )
    return conn


# ----------------------------
# FETCHERS
# ----------------------------
def fetch_sessions(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT *
            FROM "ConversationSession"
            ORDER BY id
        """)
        rows = cur.fetchall()
        logging.info(f"Fetched {len(rows)} sessions")
        return rows


def fetch_messages(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT *
            FROM "Message"
            ORDER BY id
        """)
        rows = cur.fetchall()
        logging.info(f"Fetched {len(rows)} messages")
        return rows


def fetch_lapp_scores(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT *
            FROM "LappScore"
            ORDER BY id
        """)
        rows = cur.fetchall()
        logging.info(f"Fetched {len(rows)} lapp scores")
        return rows


# ----------------------------
# HELPERS
# ----------------------------
def safe_ts(ts):
    return ts.isoformat() if ts else None


# ----------------------------
# MIGRATION
# ----------------------------
def migrate(conn):
    db = firestore.Client(project="convolab-490517")
    sessions = fetch_sessions(conn)
    messages = fetch_messages(conn)
    scores = fetch_lapp_scores(conn)

    # Index messages + scores by session
    messages_by_session: Dict[int, List[dict]] = {}
    scores_by_session: Dict[int, List[dict]] = {}

    for m in messages:
        messages_by_session.setdefault(m["sessionId"], []).append(m)

    for s in scores:
        scores_by_session.setdefault(s["sessionId"], []).append(s)

    batch = db.batch()
    op_count = 0
    BATCH_LIMIT = 450

    def flush():
        nonlocal batch, op_count
        if op_count > 0:
            batch.commit()
            batch = db.batch()
            op_count = 0

    for session in sessions:
        session_id = str(session["id"])

        session_ref = db.collection("sessions").document(session_id)

        # ---------------- session doc ----------------
        session_data = {
            "userId": session["userId"],
            "invitationId": session["invitationId"],
            "scenarioId": session["scenarioId"],
            "status": session["status"],
            "startedAt": safe_ts(session["startedAt"]),
            "endedAt": safe_ts(session["endedAt"]),
            "totalMessages": session["totalMessages"],
            "durationSeconds": session["durationSeconds"],
        }

        batch.set(session_ref, session_data)
        op_count += 1

        # ---------------- messages ----------------
        for msg in messages_by_session.get(session["id"], []):
            msg_ref = session_ref.collection("messages").document(str(msg["id"]))

            batch.set(msg_ref, {
                "role": msg["role"],
                "content": msg["content"],
                "timestamp": safe_ts(msg["timestamp"]),
                "audioUrl": msg["audioUrl"],
                "metadata": msg["metadata"],
                "asideThreadId": msg["asideThreadId"],
                "messageType": msg["messageType"],
            })

            op_count += 1
            if op_count >= BATCH_LIMIT:
                flush()

        # ---------------- lapp scores ----------------
        for sc in scores_by_session.get(session["id"], []):
            sc_ref = session_ref.collection("lappScores").document(str(sc["id"]))

            batch.set(sc_ref, {
                "userMessageId": sc["userMessageId"],
                "turnNumber": sc["turnNumber"],
                "l": sc["l"],
                "a": sc["a"],
                "p": sc["p"],
                "pe": sc["pe"],
                "tone": sc["tone"],
                "createdAt": safe_ts(sc["createdAt"]),
            })

            op_count += 1
            if op_count >= BATCH_LIMIT:
                flush()

    flush()
    logging.info("Migration complete.")


# ----------------------------
# MAIN
# ----------------------------
def main():
    conn = get_sql_connection()
    try:
        migrate(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
