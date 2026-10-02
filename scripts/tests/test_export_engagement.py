"""Tests for coaching_engagement() in export_transcripts_firestore.py.

Run with: python3.13 -m pytest -q scripts/tests
(The script imports google-cloud-firestore at module load, so that package
must be installed for the interpreter running pytest.)
"""

import importlib.util
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "export_transcripts_firestore.py"
_spec = importlib.util.spec_from_file_location("export_transcripts_firestore", _SCRIPT)
exporter = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(exporter)
coaching_engagement = exporter.coaching_engagement


def test_no_coach_messages_gives_zeros():
    msgs = [
        {"role": "partner", "messageType": "main"},
        {"role": "user", "messageType": "main"},
        {"role": "partner", "messageType": "main"},
    ]
    assert coaching_engagement(msgs) == {
        "coach_insights_n": 0, "coach_aside_n": 0, "coach_aside": 0,
    }
    assert coaching_engagement([]) == {
        "coach_insights_n": 0, "coach_aside_n": 0, "coach_aside": 0,
    }


def test_main_coach_and_asides_counted_separately():
    msgs = (
        [{"role": "coach", "messageType": "main"}] * 3
        + [{"role": "user", "messageType": "aside"}] * 2
        + [{"role": "coach", "messageType": "aside"}]  # coach reply in aside: not an insight
        + [{"role": "user", "messageType": "main"}]    # ordinary turn: not an aside
    )
    assert coaching_engagement(msgs) == {
        "coach_insights_n": 3, "coach_aside_n": 2, "coach_aside": 1,
    }


def test_missing_message_type_counts_as_main():
    msgs = [
        {"role": "coach"},
        {"role": "coach"},
        {"role": "user"},  # main-thread user turn, not an aside
    ]
    assert coaching_engagement(msgs) == {
        "coach_insights_n": 2, "coach_aside_n": 0, "coach_aside": 0,
    }
