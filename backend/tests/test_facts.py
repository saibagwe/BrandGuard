"""Tests for facts check module covering stub mode, LLM path, retry, and uploaded guidelines changing review result."""
from __future__ import annotations

import sys
import os
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.db import GuidelineDoc
from app.checks import facts, orchestrator
from app.llm.provider import llm
from app.checks.cache import clear_cache

OUTDATED_PRICE_SAMPLE = (
    "Hey guys! You're gonna love our summer deal! "
    "Get 2.5% APY on your savings account! The company was founded in 1990."
)

CORRECT_FACTS_SAMPLE = "Our savings account offers 3.2% APY and was founded in 1987 in Austin, TX."

INLINE_CONTEXT = {
    "review_id": "test-facts-001",
    "facts": "Savings account: 3.2% APY as of Q1 2024. Founded 1987. Headquartered in Austin, TX.",
    "has_guidelines": True,
}


@pytest.fixture(autouse=True)
def reset_cache_and_stub():
    clear_cache()
    original_stub = getattr(llm, "_stub", True)
    yield
    llm._stub = original_stub
    clear_cache()


class TestFactsModule:
    def test_stub_mode_detects_outdated_apy(self):
        """Stub mode flags planted 2.5% APY and wrong founded year."""
        llm._stub = True
        issues = facts.run(OUTDATED_PRICE_SAMPLE, INLINE_CONTEXT)
        assert len(issues) >= 2
        apy_issue = [i for i in issues if "2.5%" in i.message][0]
        assert apy_issue.category == "fact"
        assert apy_issue.severity == "high"
        assert apy_issue.evidence is not None
        assert apy_issue.evidence.source_doc == "Approved Facts"
        assert "3.2% APY" in (apy_issue.evidence.quote or "")
        assert apy_issue.location.start is not None

    def test_stub_mode_clean_content(self):
        """Clean content returns no fact issues in stub mode."""
        llm._stub = True
        issues = facts.run(CORRECT_FACTS_SAMPLE, INLINE_CONTEXT)
        assert len(issues) == 0

    def test_empty_context_returns_no_issues(self):
        """Empty context returns no fact issues."""
        llm._stub = True
        issues = facts.run(OUTDATED_PRICE_SAMPLE, {"review_id": "test-facts-empty"})
        assert len(issues) == 0

    def test_mocked_llm_contradicted_and_unverifiable(self):
        """Mocked LLM correctly separates contradicted (HIGH) from unverifiable (MEDIUM, evidence null)."""
        llm._stub = False
        content = "Enjoy 2.5% APY and get an unprecedented 50% cashback on all travel purchases."

        mock_response = {
            "issues": [
                {
                    "quote": "2.5% APY",
                    "issue_type": "contradicted",
                    "message": "Outdated APY: states 2.5% APY instead of approved 3.2% APY.",
                    "approved_fact": "Savings account: 3.2% APY as of Q1 2024.",
                    "source_doc": "Approved Facts",
                    "rule_id": "FACT-APY-001",
                    "suggestion": "Update to 3.2% APY.",
                },
                {
                    "quote": "50% cashback on all travel purchases",
                    "issue_type": "unverifiable",
                    "message": "Factual statement regarding 50% cashback has no approved source found.",
                    "approved_fact": None,
                    "source_doc": None,
                    "rule_id": None,
                    "suggestion": "Verify promotion details or qualify offer.",
                },
            ]
        }

        with patch.object(llm, "generate_json", return_value=mock_response):
            issues = facts.run(content, INLINE_CONTEXT)
            assert len(issues) == 2

            contradicted = [i for i in issues if "2.5%" in i.message][0]
            assert contradicted.severity == "high"
            assert contradicted.evidence is not None
            assert contradicted.evidence.source_doc == "Approved Facts"
            assert "3.2% APY" in contradicted.evidence.quote
            assert contradicted.location.start == content.find("2.5% APY")

            unverifiable = [i for i in issues if "cashback" in i.message.lower()][0]
            assert unverifiable.severity == "medium"
            assert unverifiable.evidence is None  # Must be null per prompt
            assert "no approved source found" in unverifiable.message.lower()
            assert unverifiable.location.start == content.find("50% cashback on all travel purchases")

    def test_invalid_json_retry(self):
        """Retries once on invalid JSON structure before succeeding."""
        llm._stub = False
        content = "Get 2.5% APY on all balances."
        invalid_resp = {"random": "payload"}
        valid_resp = {
            "issues": [
                {
                    "quote": "2.5% APY",
                    "issue_type": "contradicted",
                    "message": "Contradicts approved 3.2% APY rate.",
                    "approved_fact": "Savings account: 3.2% APY as of Q1 2024.",
                    "source_doc": "Approved Facts",
                    "rule_id": "FACT-001",
                    "suggestion": "Use 3.2% APY.",
                }
            ]
        }

        with patch.object(llm, "generate_json", side_effect=[invalid_resp, valid_resp]) as mock_gen:
            issues = facts.run(content, INLINE_CONTEXT)
            assert mock_gen.call_count == 2
            assert len(issues) == 1
            assert issues[0].severity == "high"

    def test_uploaded_fact_document_changes_review_result(self):
        """An uploaded fact document changes the context and the resulting review."""
        llm._stub = False
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        TestingSession = sessionmaker(bind=engine)
        db = TestingSession()

        try:
            # Seed initial guidelines document in db
            doc1 = GuidelineDoc(
                id="fact-doc-001",
                title="Approved Facts",
                doc_type="facts",
                content_text="Savings account: 3.2% APY as of Q1 2024. Founded 1987 in Austin, TX.",
            )
            db.add(doc1)
            db.commit()

            content = "Savings account now gives 4.8% APY."

            # Review 1: with initial approved facts (where APY is 3.2%), LLM flags 4.8% APY as contradicted
            context1 = orchestrator.build_context_from_db(db, review_id="rev-1")
            assert "3.2% APY" in context1["facts"]

            def mock_generate(prompt, schema):
                if "4.8% APY as of Q4 2026" in prompt:
                    # The new fact is present in the prompt, so 4.8% APY is approved
                    return {"issues": []}
                # Otherwise, 4.8% contradicts approved facts
                return {
                    "issues": [
                        {
                            "quote": "4.8% APY",
                            "issue_type": "contradicted",
                            "message": "Contradicted APY: Approved fact states 3.2% APY.",
                            "approved_fact": "Savings account: 3.2% APY as of Q1 2024.",
                            "source_doc": "Approved Facts",
                            "rule_id": "FACT-001",
                            "suggestion": "Change to 3.2% APY.",
                        }
                    ]
                }

            with patch.object(llm, "generate_json", side_effect=mock_generate):
                issues_run1 = facts.run(content, context1)
                assert len(issues_run1) == 1
                assert "3.2% APY" in issues_run1[0].evidence.quote

                # Now Admin uploads a new GuidelineDoc with updated facts!
                new_doc = GuidelineDoc(
                    id="fact-doc-002",
                    title="Q4 2026 Approved Rates",
                    doc_type="facts",
                    content_text="Savings account: 4.8% APY as of Q4 2026. FDIC insured up to $250,000.",
                )
                db.add(new_doc)
                db.commit()

                # Verify build_context_from_db now has the new uploaded fact
                context2 = orchestrator.build_context_from_db(db, review_id="rev-2")
                assert "4.8% APY as of Q4 2026" in context2["facts"]
                assert context2["context_version"] != context1["context_version"]

                # Run review 2 with the updated facts context
                issues_run2 = facts.run(content, context2)
                # With the new uploaded document, 4.8% APY is now verified, so 0 fact issues!
                assert len(issues_run2) == 0

        finally:
            db.close()
