"""Tests for claims check module covering keyword pre-filter, stub mode, LLM path, and retry."""
from __future__ import annotations

import sys
import os
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from app.checks import claims
from app.llm.provider import llm
from app.checks.cache import clear_cache

CLAIMS_SAMPLE = (
    "Hey guys! You're gonna love our awesome summer savings deal! "
    "Get 2.5% APY on your savings account - best in class rates that are totally "
    "unmatched in the industry! lol just kidding but seriously this is super great!"
)

CLEAN_SAMPLE = "We offer competitive rates designed to meet your savings goals."


@pytest.fixture(autouse=True)
def reset_cache_and_stub():
    clear_cache()
    original_stub = getattr(llm, "_stub", True)
    yield
    llm._stub = original_stub
    clear_cache()


class TestClaimsModule:
    def test_keyword_prefilter_skips_clean_content(self):
        """Clean content without claim keywords is skipped immediately without LLM call."""
        llm._stub = False
        with patch.object(llm, "generate_json") as mock_gen:
            issues = claims.run(CLEAN_SAMPLE, {"review_id": "test-claims-001"})
            assert len(issues) == 0
            assert not mock_gen.called

    def test_stub_mode_detects_superlatives(self):
        """Stub mode flags 'best in class' and 'unmatched' in the seeded sample."""
        llm._stub = True
        issues = claims.run(CLAIMS_SAMPLE, {"review_id": "test-claims-002"})
        assert len(issues) > 0
        assert issues[0].category == "claim"
        assert issues[0].severity == "high"
        assert issues[0].evidence is not None
        assert issues[0].evidence.source_doc == "Brand Guidelines"
        assert issues[0].location is not None

    def test_mocked_llm_substantiated_vs_unsubstantiated(self):
        """Mocked LLM ignores substantiated claims and emits HIGH issue for unsubstantiated claims."""
        llm._stub = False
        content = "Nimbus Bank offers the fastest transfer speeds and guaranteed zero downtime."

        mock_response = {
            "claims": [
                {
                    "quote": "fastest transfer speeds",
                    "message": "Substantiated by Q1 benchmark.",
                    "substantiated": True,
                    "suggestion": None,
                },
                {
                    "quote": "guaranteed zero downtime",
                    "message": "Absolute guarantee statement has no approved supporting source found.",
                    "substantiated": False,
                    "source_doc": "Brand Guidelines",
                    "rule_id": "CLAIM-001",
                    "suggestion": "Replace with: 'Engineered for high reliability with 99.9% uptime target.'",
                },
            ]
        }

        with patch.object(llm, "generate_json", return_value=mock_response):
            issues = claims.run(content, {"review_id": "test-claims-003"})
            # Substantiated claim MUST NOT be flagged
            assert len(issues) == 1
            issue = issues[0]
            assert issue.category == "claim"
            assert issue.severity == "high"
            assert "guaranteed zero downtime" in issue.message or "guaranteed zero downtime" == content[issue.location.start:issue.location.end]
            assert "no approved supporting source" in issue.message.lower() or "no approved source" in issue.message.lower()
            assert issue.evidence.source_doc == "Brand Guidelines"
            assert issue.location.start == content.find("guaranteed zero downtime")
            assert "high reliability" in issue.suggestion

    def test_invalid_json_retry(self):
        """Retries once on invalid JSON structure before succeeding."""
        llm._stub = False
        content = "We have world-class customer service."
        invalid_resp = {"random": "payload"}
        valid_resp = {
            "claims": [
                {
                    "quote": "world-class",
                    "message": "Unsubstantiated superlative: no approved supporting source was found.",
                    "substantiated": False,
                    "source_doc": "Brand Guidelines",
                    "rule_id": "CLAIM-001",
                    "suggestion": "Replace with 'dedicated customer support'.",
                }
            ]
        }

        with patch.object(llm, "generate_json", side_effect=[invalid_resp, valid_resp]) as mock_gen:
            issues = claims.run(content, {"review_id": "test-claims-004"})
            assert mock_gen.call_count == 2
            assert len(issues) == 1
            assert issues[0].category == "claim"
            assert issues[0].severity == "high"

    def test_quota_fallback(self):
        """Quota error falls back to regex check without raising."""
        llm._stub = False
        with patch.object(llm, "generate_json", side_effect=Exception("429 ResourceExhausted: Quota exceeded")):
            issues = claims.run(CLAIMS_SAMPLE, {"review_id": "test-claims-005"})
            assert len(issues) > 0
            assert issues[0].category == "claim"
