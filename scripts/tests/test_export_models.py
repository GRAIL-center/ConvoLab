"""Tests for session_models() in export_transcripts_firestore.py.

Run with: python3.13 -m pytest -q scripts/tests
"""

import importlib.util
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "export_transcripts_firestore.py"
_spec = importlib.util.spec_from_file_location("export_transcripts_firestore", _SCRIPT)
exporter = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(exporter)
session_models = exporter.session_models

SNAPSHOT = {
    "studySource": "qualtrics_prolific",
    "studyPartnerModel": "claude-sonnet-5",
    "studyCoachModel": "google:gemini-2.5-flash",
    "studyScorerModel": "google:gemini-2.5-flash",
}
LIVE_SCENARIO = {"partnerModel": "claude-haiku-4-5", "coachModel": "claude-haiku-4-5"}


def test_snapshot_wins_over_live_scenario():
    assert session_models(SNAPSHOT, LIVE_SCENARIO) == {
        "partner_model": "claude-sonnet-5",
        "coach_model": "google:gemini-2.5-flash",
        "scorer_model": "google:gemini-2.5-flash",
        "models_from_snapshot": True,
    }


def test_study_session_without_snapshot_is_null_and_flagged():
    # Pre-snapshot study sessions have no scenarioId, so the scenario is {}.
    assert session_models({"studySource": "qualtrics_prolific"}, {}) == {
        "partner_model": None,
        "coach_model": None,
        "scorer_model": None,
        "models_from_snapshot": False,
    }


def test_scenario_session_falls_back_to_live_scenario():
    assert session_models({}, LIVE_SCENARIO) == {
        "partner_model": "claude-haiku-4-5",
        "coach_model": "claude-haiku-4-5",
        "scorer_model": None,
        "models_from_snapshot": False,
    }


def test_partial_snapshot_is_not_trusted():
    s = {"studyPartnerModel": "claude-sonnet-5"}
    out = session_models(s, {})
    assert out["partner_model"] == "claude-sonnet-5"
    assert out["models_from_snapshot"] is False
