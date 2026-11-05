"""Claims check — detects unsubstantiated superlative claims.

Stub: regex for banned superlative phrases.
"""
from __future__ import annotations

import re
from uuid import uuid4
from app.models.schemas import Issue, IssueEvidence, IssueLocation

_SUPERLATIVES = [
    r"best\s+in\s+class",
    r"industry[\s-]leading",
    r"#\s*1\b",
    r"number\s+one\b",
    r"unmatched",
    r"best\s+\w+\s+experience",
    r"best\s+\w+\s+card",
    r"best\s+\w+\s+bank",
]

_PATTERN = re.compile(
    r"(" + "|".join(_SUPERLATIVES) + r")",
    re.IGNORECASE,
)


def run(content: str, context: dict) -> list[Issue]:
    """Return claim issues found in *content*."""
    matches = list(_PATTERN.finditer(content))
    if not matches:
        return []

    found_phrases = [m.group() for m in matches]
    count = len(matches)
    severity = "high" if count >= 2 else "medium"

    first = matches[0]

    issue = Issue(
        id=str(uuid4()),
        review_id=context.get("review_id", ""),
        category="claim",
        severity=severity,
        location=IssueLocation(start=first.start(), end=first.end()),
        message=f"Unsubstantiated superlative claims detected: {found_phrases}. These claims require substantiation or must be removed.",
        evidence=IssueEvidence(
            source_doc="Brand Guidelines",
            quote="All comparative or superlative claims must be substantiated with verified data.",
            rule_id="CLAIM-001",
        ),
        suggestion="Remove or qualify claims. Use 'competitive rates' instead of 'best in class', or cite a verified source.",
        status="open",
    )
    return [issue]
