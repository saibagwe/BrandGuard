"""Tone check — detects casual / banned language.

Stub implementation: pure Python regex against a banned-word list.
Real implementation would call llm.generate_json() with brand-voice guidelines.
"""
from __future__ import annotations

import re
from uuid import uuid4
from app.models.schemas import Issue, IssueEvidence, IssueLocation

BANNED_CASUAL = [
    "hey", "guys", "gonna", "wanna", "lol", "awesome", "super",
]

# Pattern: whole-word match, case-insensitive
_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(w) for w in BANNED_CASUAL) + r")\b",
    re.IGNORECASE,
)


def run(content: str, context: dict) -> list[Issue]:
    """Return tone issues found in *content*."""
    matches = _PATTERN.findall(content)
    if not matches:
        return []

    unique_matches = list(dict.fromkeys(m.lower() for m in matches))
    count = len(matches)
    severity = "high" if count >= 3 else ("medium" if count >= 1 else "low")

    # Find first match span for location
    m = _PATTERN.search(content)
    location = IssueLocation(start=m.start(), end=m.end()) if m else None

    evidence = IssueEvidence(
        source_doc="Terminology Rules",
        quote="Banned words: awesome, guys, gonna, wanna, lol, super, hey.",
        rule_id="TONE-001",
    )

    issue = Issue(
        id=str(uuid4()),
        review_id=context.get("review_id", ""),
        category="tone",
        severity=severity,
        location=location,
        message=f"Casual language detected: {unique_matches}. These words violate Nimbus Bank brand voice guidelines.",
        evidence=evidence,
        suggestion=(
            "Rewrite using professional language. Example: 'Discover our summer savings offer. "
            "Enjoy 3.2% APY on your NimbusGrow Savings account — a rate designed to help you grow your money.'"
        ),
        status="open",
    )
    return [issue]
