"""Tests for check modules with inline neutral fixtures."""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from app.checks import tone, claims, facts

GUIDELINE_VOICE = (
    "Brand Voice: Professional and trustworthy. "
    "Avoid casual language (hey, guys, gonna, lol, awesome, super)."
)
GUIDELINE_TERMINOLOGY = (
    "Preferred: 'savings account'. "
    "Banned words: awesome, guys, gonna, wanna, lol, super, hey."
)
GUIDELINE_FACTS = (
    "Savings account: 3.2% APY as of Q1 2024. "
    "Founded 1987. Headquartered in Austin, TX."
)

CONTEXT = {
    "review_id": "test-review-001",
    "voice_guide": GUIDELINE_VOICE,
    "terminology": GUIDELINE_TERMINOLOGY,
    "facts": GUIDELINE_FACTS,
    "has_guidelines": True,
}

SAMPLE_CONTENT = (
    "Hey guys! You're gonna love our awesome summer savings deal! "
    "Get 2.5% APY on your savings account - best in class rates that are totally "
    "unmatched in the industry! lol just kidding but seriously this is super great!"
)


class TestToneCheck:
    def test_detects_casual_words(self):
        issues = tone.run(SAMPLE_CONTENT, CONTEXT)
        assert len(issues) > 0, "Expected at least one tone issue"

    def test_issue_category(self):
        issues = tone.run(SAMPLE_CONTENT, CONTEXT)
        assert issues[0].category == "tone"

    def test_severity_high_for_many_violations(self):
        issues = tone.run(SAMPLE_CONTENT, CONTEXT)
        assert issues[0].severity == "high"

    def test_no_issue_for_clean_content(self):
        clean = "Discover our professional financial services tailored for your goals."
        issues = tone.run(clean, CONTEXT)
        assert len(issues) == 0

    def test_evidence_present(self):
        issues = tone.run(SAMPLE_CONTENT, CONTEXT)
        assert issues[0].evidence is not None
        assert "TONE-001" in (issues[0].evidence.rule_id or "")


class TestClaimsCheck:
    def test_detects_best_in_class(self):
        issues = claims.run(SAMPLE_CONTENT, CONTEXT)
        assert len(issues) > 0, "Expected at least one claim issue"

    def test_issue_category(self):
        issues = claims.run(SAMPLE_CONTENT, CONTEXT)
        assert issues[0].category == "claim"

    def test_detects_unmatched(self):
        content = "Our unmatched service is second to none."
        issues = claims.run(content, CONTEXT)
        assert any("unmatched" in i.message.lower() for i in issues)

    def test_no_issue_for_qualified_claims(self):
        clean = "We offer competitive rates designed to meet your savings goals."
        issues = claims.run(clean, CONTEXT)
        assert len(issues) == 0


class TestFactsCheck:
    def test_detects_wrong_apy(self):
        issues = facts.run(SAMPLE_CONTENT, CONTEXT)
        apy_issues = [i for i in issues if "2.5%" in i.message or "APY" in i.message]
        assert len(apy_issues) > 0, "Expected APY fact issue"

    def test_issue_category(self):
        issues = facts.run(SAMPLE_CONTENT, CONTEXT)
        assert all(i.category == "fact" for i in issues)

    def test_severity_high_for_apy(self):
        issues = facts.run(SAMPLE_CONTENT, CONTEXT)
        apy_issues = [i for i in issues if "APY" in i.message]
        assert apy_issues[0].severity == "high"

    def test_detects_wrong_founded_year(self):
        content = "The company was founded in 1990 and serves customers nationwide."
        issues = facts.run(content, CONTEXT)
        assert any("1990" in i.message for i in issues)

    def test_detects_wrong_headquarters(self):
        content = "Headquartered in Dallas, TX, we are committed to excellence."
        issues = facts.run(content, CONTEXT)
        assert any("Dallas" in i.message for i in issues)

    def test_no_issue_for_correct_facts(self):
        clean = "Our savings account offers 3.2% APY and the organization was founded in 1987 in Austin, TX."
        issues = facts.run(clean, CONTEXT)
        assert len(issues) == 0
