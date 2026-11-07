"""Facts check — detects incorrect, outdated, or unverifiable factual claims.

Uses LLM when available against the full approved facts from context,
with regex check as fallback and for stub mode.
"""
from __future__ import annotations

import logging
import re
from typing import Literal, Optional
from uuid import uuid4
from pydantic import BaseModel

from app.models.schemas import Issue, IssueEvidence, IssueLocation
from app.llm.provider import llm
from app.checks.defaults import DEFAULT_APPROVED_FACTS
from app.checks.cache import make_cache_key, get_cached, set_cached
from app.checks.utils import find_quote_location, format_context_field, compute_context_version

logger = logging.getLogger(__name__)

# Planted incorrect facts to detect (for fallback & stub mode)
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

FACTS_SCHEMA = {
    "type": "object",
    "properties": {
        "issues": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "quote": {"type": "string", "description": "The exact checkable statement from content"},
                    "issue_type": {"type": "string", "enum": ["contradicted", "outdated", "unverifiable"]},
                    "message": {"type": "string", "description": "Plain-language explanation. For unverifiable, must say 'no approved source found'."},
                    "approved_fact": {"type": "string", "description": "The exact approved fact from guidelines (for contradicted/outdated)"},
                    "source_doc": {"type": "string", "description": "Document name (e.g. Approved Facts)"},
                    "rule_id": {"type": "string", "description": "Rule identifier like FACT-001"},
                    "suggestion": {"type": "string", "description": "Corrected sentence using the approved value"},
                },
                "required": ["quote", "issue_type", "message", "suggestion"],
            },
        },
    },
    "required": ["issues"],
}


class LLMFactItem(BaseModel):
    quote: str
    issue_type: Literal["contradicted", "outdated", "unverifiable"]
    message: str
    approved_fact: Optional[str] = None
    source_doc: Optional[str] = "Approved Facts"
    rule_id: Optional[str] = "FACT-001"
    suggestion: Optional[str] = None


class LLMFactsResponse(BaseModel):
    issues: list[LLMFactItem]


def _run_regex(content: str, review_id: str) -> list[Issue]:
    """Deterministic fallback regex checks."""
    issues: list[Issue] = []
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


def run(content: str, context: dict) -> list[Issue]:
    """Return fact issues found in *content*."""
    try:
        review_id = context.get("review_id", "")
        facts = format_context_field(context.get("facts"), DEFAULT_APPROVED_FACTS)
        context_version = context.get("context_version") or compute_context_version(facts)

        # In stub mode, immediately return deterministic regex issues
        if getattr(llm, "_stub", True):
            return _run_regex(content, review_id)

        # Check in-memory cache
        cache_key = make_cache_key("facts", content, context_version)
        cached = get_cached(cache_key)
        if cached is not None:
            return cached

        prompt = (
            "You are a factual accuracy compliance reviewer for Nimbus Bank.\n\n"
            f"Approved Facts:\n{facts}\n\n"
            f"Content to Review:\n\"\"\"{content}\"\"\"\n\n"
            "Task:\n"
            "Extract all checkable factual statements (prices, interest rates, APY, APR, dates, founded year, locations, fees, terms, and policies).\n"
            "Compare them against the Approved Facts above.\n\n"
            "Return ONLY statements that are:\n"
            "1. Contradicted or outdated:\n"
            "   - issue_type: 'contradicted' or 'outdated'\n"
            "   - severity: HIGH\n"
            "   - quote: the EXACT offending statement from the content\n"
            "   - approved_fact: verbatim approved fact from the Approved Facts that contradicts or updates it\n"
            "   - source_doc: 'Approved Facts'\n"
            "   - message: clear plain-language explanation of the discrepancy\n"
            "   - suggestion: corrected sentence using the approved value\n\n"
            "2. Unverifiable (claims a factual price, rate, date, policy, etc. with no supporting entry in Approved Facts):\n"
            "   - issue_type: 'unverifiable'\n"
            "   - severity: MEDIUM\n"
            "   - quote: the EXACT checkable statement from the content\n"
            "   - approved_fact: null\n"
            "   - source_doc: null\n"
            "   - message: plain-language explanation stating 'no approved source found'\n"
            "   - suggestion: compliant sentence qualifying or removing the unverifiable statement\n\n"
            "Do NOT return statements that are consistent with and supported by the Approved Facts.\n"
            "If all statements are verified or there are no factual claims, return {\"issues\": []}."
        )

        parsed: Optional[LLMFactsResponse] = None
        for attempt in range(2):
            try:
                curr_prompt = prompt if attempt == 0 else prompt + "\n\nNOTE: Previous output was invalid JSON. Return strictly matching JSON."
                raw = llm.generate_json(curr_prompt, FACTS_SCHEMA)
                if raw and isinstance(raw, dict):
                    parsed = LLMFactsResponse.model_validate(raw)
                    break
            except Exception as exc:
                err_str = str(exc).lower()
                if "429" in err_str or "quota" in err_str or "resourceexhausted" in err_str:
                    logger.warning("LLM quota exceeded / 429 error in facts check. Falling back to regex.")
                    return _run_regex(content, review_id)
                if attempt == 1:
                    logger.error("Facts check validation failed after retry: %s", exc)

        if parsed is None:
            return _run_regex(content, review_id)

        issues: list[Issue] = []
        for item in parsed.issues:
            loc = find_quote_location(content, item.quote)
            if item.issue_type in ("contradicted", "outdated"):
                severity = "high"
                evidence = IssueEvidence(
                    source_doc=item.source_doc or "Approved Facts",
                    quote=item.approved_fact,
                    rule_id=item.rule_id or "FACT-001",
                )
                message = item.message
            else:
                # Unverifiable
                severity = "medium"
                evidence = None
                message = item.message
                if "no approved source found" not in message.lower():
                    message = f"{message} (no approved source found)"

            issues.append(
                Issue(
                    id=str(uuid4()),
                    review_id=review_id,
                    category="fact",
                    severity=severity,
                    location=loc,
                    message=message,
                    evidence=evidence,
                    suggestion=item.suggestion or "Correct statement using approved facts.",
                    status="open",
                )
            )

        set_cached(cache_key, issues)
        return issues

    except Exception as exc:
        logger.error("Unexpected error in facts check: %s", exc)
        return _run_regex(content, context.get("review_id", ""))
