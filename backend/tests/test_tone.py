"""Tests for tone check module covering stub mode, LLM path, retry, caching, and fallback."""
from __future__ import annotations

import sys
import os
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from app.checks import tone
from app.llm.provider import llm
from app.checks.cache import clear_cache

REVIEW_SAMPLE = (
    "Hey guys! You're gonna love our awesome summer savings deal! "
    "Get 2.5% APY on your savings account - best in class rates that are totally "
    "unmatched in the industry! lol just kidding but seriously this is super great!"
)

CLEAN_SAMPLE = "Discover our professional banking services tailored for your financial growth."


@pytest.fixture(autouse=True)
def reset_cache_and_stub():
    clear_cache()
    original_stub = getattr(llm, "_stub", True)
    yield
    llm._stub = original_stub
    clear_cache()


class TestToneModule:
    def test_stub_mode_casual_language(self):
        """Stub mode should flag casual language in the seeded sample."""
        llm._stub = True
        issues = tone.run(REVIEW_SAMPLE, {"review_id": "test-review-001"})
        assert len(issues) > 0
        assert issues[0].category == "tone"
        assert issues[0].severity == "high"
        assert issues[0].evidence is not None
        assert "TONE-001" in (issues[0].evidence.rule_id or "")
        assert issues[0].location is not None
        assert issues[0].location.start is not None

    def test_stub_mode_clean_content(self):
        """Clean content returns no tone issues in stub mode."""
        llm._stub = True
        issues = tone.run(CLEAN_SAMPLE, {"review_id": "test-review-001"})
        assert len(issues) == 0

    def test_mocked_llm_path(self):
        """Mocked LLM path validates output, computes locations, and sets evidence."""
        llm._stub = False
        mock_response = {
            "issues": [
                {
                    "quote": "Hey guys!",
                    "message": "Informal greeting violates professional voice guideline.",
                    "severity": "high",
                    "source_doc": "Voice Guide",
                    "guideline_quote": "Avoid casual language (hey, guys, gonna, lol, awesome).",
                    "rule_id": "TONE-001",
                    "suggestion": "Welcome to our summer savings offer.",
                }
            ]
        }

        with patch.object(llm, "generate_json", return_value=mock_response) as mock_gen:
            issues = tone.run(REVIEW_SAMPLE, {"review_id": "test-review-002"})
            assert mock_gen.called
            assert len(issues) >= 1
            llm_issue = [i for i in issues if i.message.startswith("Informal greeting")][0]
            assert llm_issue.category == "tone"
            assert llm_issue.severity == "high"
            assert llm_issue.location is not None
            assert llm_issue.location.start == 0  # "Hey guys!" is at index 0
            assert llm_issue.evidence.source_doc == "Voice Guide"
            assert "Avoid casual language" in llm_issue.evidence.quote

    def test_invalid_json_retry(self):
        """Retries once on invalid JSON/schema before succeeding."""
        llm._stub = False
        invalid_response = {"wrong_key": 123}
        valid_response = {
            "issues": [
                {
                    "quote": "lol",
                    "message": "Chat slang 'lol' violates brand voice standards.",
                    "severity": "medium",
                    "source_doc": "Voice Guide",
                    "guideline_quote": "Avoid casual language (hey, guys, gonna, lol, awesome).",
                    "rule_id": "TONE-002",
                    "suggestion": "Remove slang.",
                }
            ]
        }

        with patch.object(llm, "generate_json", side_effect=[invalid_response, valid_response]) as mock_gen:
            issues = tone.run(REVIEW_SAMPLE, {"review_id": "test-review-003"})
            assert mock_gen.call_count == 2
            assert any("lol" in i.message.lower() for i in issues)

    def test_cache_hits(self):
        """Subsequent identical calls should hit in-memory cache and not call LLM again."""
        llm._stub = False
        valid_response = {
            "issues": [
                {
                    "quote": "awesome",
                    "message": "Banned word 'awesome'.",
                    "severity": "low",
                    "source_doc": "Terminology Rules",
                    "guideline_quote": "Banned words: awesome",
                    "rule_id": "TONE-001",
                    "suggestion": "Replace with exceptional.",
                }
            ]
        }

        with patch.object(llm, "generate_json", return_value=valid_response) as mock_gen:
            issues1 = tone.run(REVIEW_SAMPLE, {"review_id": "test-review-004"})
            issues2 = tone.run(REVIEW_SAMPLE, {"review_id": "test-review-004"})
            assert mock_gen.call_count == 1
            assert len(issues1) == len(issues2)

    def test_quota_error_falls_back_gracefully(self):
        """Quota / 429 error falls back gracefully to regex without raising."""
        llm._stub = False
        with patch.object(llm, "generate_json", side_effect=Exception("429 ResourceExhausted: Quota exceeded")):
            issues = tone.run(REVIEW_SAMPLE, {"review_id": "test-review-005"})
            # Falls back to regex check, detecting casual words
            assert len(issues) > 0
            assert issues[0].category == "tone"
