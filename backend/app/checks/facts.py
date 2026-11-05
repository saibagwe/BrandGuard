"""Facts check — detects incorrect factual claims.

Stub: looks for the planted outdated APY figure "2.5% APY" (should be "3.2% APY").
Real implementation would compare extracted claims against approved facts from guideline docs.
"""
from __future__ import annotations

import re
from uuid import uuid4
from app.models.schemas import Issue, IssueEvidence, IssueLocation

# Planted incorrect facts to detect
_INCORRECT_APY = re.compile(r"\b2\.5%\s*APY\b", re.IGNORECASE)
_INCORRECT_INTRO_APR = re.compile(r"\b15\s*months\b", re.IGNORECASE)
_INCORRECT_FOUNDED = re.compile(r"\bfounded\s+in\s+1990\b", re.IGNORECASE)
_INCORRECT_HQ = re.compile(r"\b(Dallas,\s*TX|Dallas,\s*Texas)\b", re.IGNORECASE)

_CHECKS = [
    (
        _INCORRECT_APY,
        "fact",
        "high",
        "Incorrect APY stated: '2.5% APY'. Approved fact states NimbusGrow Savings is 3.2% APY.",
        "Replace '2.5% APY' with '3.2% APY'.",
        "Approved Facts",
        "NimbusGrow Savings: 3.2% APY as of Q1 2024.",
        "FACT-APY-001",
    ),
    (
        _INCORRECT_INTRO_APR,
        "fact",
        "high",
        "Incorrect intro APR period: '15 months'. Approved fact states 12 months.",
        "Replace '15 months' with '12 months'.",
        "Approved Facts",
        "NimbusShield Credit Card: 0% intro APR for 12 months.",
        "FACT-APR-001",
    ),
    (
        _INCORRECT_FOUNDED,
        "fact",
        "high",
        "Founded year incorrect: '1990'. Approved fact: founded 1987.",
        "Replace '1990' with '1987'.",
        "Approved Facts",
        "Founded 1987.",
        "FACT-FOUND-001",
    ),
    (
        _INCORRECT_HQ,
        "fact",
        "medium",
        "Headquarters incorrect: 'Dallas, TX'. Approved fact: Austin, TX.",
        "Replace 'Dallas, TX' with 'Austin, TX'.",
        "Approved Facts",
        "Headquartered in Austin, TX.",
        "FACT-HQ-001",
    ),
]


def run(content: str, context: dict) -> list[Issue]:
    """Return fact issues found in *content*."""
    issues: list[Issue] = []
    review_id = context.get("review_id", "")

    for pattern, category, severity, message, suggestion, source_doc, quote, rule_id in _CHECKS:
        m = pattern.search(content)
        if m:
            issues.append(
                Issue(
                    id=str(uuid4()),
                    review_id=review_id,
                    category=category,  # type: ignore[arg-type]
                    severity=severity,  # type: ignore[arg-type]
                    location=IssueLocation(start=m.start(), end=m.end()),
                    message=message,
                    evidence=IssueEvidence(source_doc=source_doc, quote=quote, rule_id=rule_id),
                    suggestion=suggestion,
                    status="open",
                )
            )
    return issues
