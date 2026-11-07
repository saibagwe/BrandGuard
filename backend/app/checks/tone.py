"""Tone check — detects casual / banned language and brand voice violations.

Uses LLM when available with brand voice guidelines and terminology rules,
with deterministic regex check as a layer and fallback.
"""
from __future__ import annotations

import logging
import re
from typing import Literal, Optional
from uuid import uuid4
from pydantic import BaseModel

from app.models.schemas import Issue, IssueEvidence, IssueLocation
from app.llm.provider import llm
from app.checks.defaults import DEFAULT_VOICE_GUIDE, DEFAULT_TERMINOLOGY
from app.checks.cache import make_cache_key, get_cached, set_cached
from app.checks.utils import find_quote_location, format_context_field, compute_context_version

logger = logging.getLogger(__name__)

BANNED_CASUAL = [
    "hey", "guys", "gonna", "wanna", "lol", "awesome", "super",
]

# Pattern: whole-word match, case-insensitive
_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(w) for w in BANNED_CASUAL) + r")\b",
    re.IGNORECASE,
)

TONE_SCHEMA = {
    "type": "object",
    "properties": {
        "issues": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "quote": {"type": "string", "description": "Exact text from content violating tone"},
                    "message": {"type": "string", "description": "Plain-language explanation naming guideline breach"},
                    "severity": {"type": "string", "enum": ["high", "medium", "low"]},
                    "source_doc": {"type": "string", "description": "Name of guideline document violated"},
                    "guideline_quote": {"type": "string", "description": "Verbatim quote from the guideline"},
                    "rule_id": {"type": "string", "description": "Rule identifier like TONE-001"},
                    "suggestion": {"type": "string", "description": "Intent-preserving rewrite using professional language"},
                },
                "required": ["quote", "message", "severity", "source_doc", "suggestion"],
            },
        },
    },
    "required": ["issues"],
}


class LLMToneItem(BaseModel):
    quote: str
    message: str
    severity: Literal["high", "medium", "low"] = "medium"
    source_doc: str = "Voice Guide"
    guideline_quote: Optional[str] = None
    rule_id: Optional[str] = "TONE-001"
    suggestion: Optional[str] = None


class LLMToneResponse(BaseModel):
    issues: list[LLMToneItem]


def _run_regex(content: str, review_id: str) -> list[Issue]:
    """Deterministic regex check against banned casual words."""
    matches = _PATTERN.findall(content)
    if not matches:
        return []

    unique_matches = list(dict.fromkeys(m.lower() for m in matches))
    count = len(matches)
    severity = "high" if count >= 3 else ("medium" if count >= 1 else "low")

    m = _PATTERN.search(content)
    location = IssueLocation(start=m.start(), end=m.end()) if m else None

    evidence = IssueEvidence(
        source_doc="Terminology Rules",
        quote="Banned words: awesome, guys, gonna, wanna, lol, super, hey.",
        rule_id="TONE-001",
    )

    issue = Issue(
        id=str(uuid4()),
        review_id=review_id,
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


def run(content: str, context: dict) -> list[Issue]:
    """Return tone issues found in *content*."""
    try:
        review_id = context.get("review_id", "")
        voice_guide = format_context_field(context.get("voice_guide"), DEFAULT_VOICE_GUIDE)
        terminology = format_context_field(context.get("terminology"), DEFAULT_TERMINOLOGY)
        context_version = context.get("context_version") or compute_context_version(voice_guide, terminology)

        # Deterministic regex layer
        regex_issues = _run_regex(content, review_id)

        # In stub mode, immediately return deterministic regex issues
        if getattr(llm, "_stub", True):
            return regex_issues

        # Check in-memory cache
        cache_key = make_cache_key("tone", content, context_version)
        cached = get_cached(cache_key)
        if cached is not None:
            return cached

        # Prepare LLM prompt
        prompt = (
            "You are a brand compliance reviewer checking content against brand voice guidelines and terminology rules.\n\n"
            f"Brand Voice Guidelines:\n{voice_guide}\n\n"
            f"Terminology Rules:\n{terminology}\n\n"
            f"Content to Review:\n\"\"\"{content}\"\"\"\n\n"
            "Analyze the content and flag any tone breaches:\n"
            "- Casual language, slang, or informal phrasing (e.g. hey, guys, gonna, wanna, lol, awesome, super)\n"
            "- Banned terminology\n"
            "- Exclamation mark overuse (e.g. more than one exclamation mark)\n\n"
            "Requirements for each issue:\n"
            "- quote: exact offending text from the content\n"
            "- message: plain-language explanation naming and quoting the guideline\n"
            "- severity: 'high', 'medium', or 'low'\n"
            "- source_doc: 'Voice Guide' or 'Terminology Rules'\n"
            "- guideline_quote: verbatim quote from the guideline violated\n"
            "- rule_id: e.g. 'TONE-001'\n"
            "- suggestion: intent-preserving rewrite using professional language\n\n"
            "If no tone violations exist, return {\"issues\": []}."
        )

        parsed: Optional[LLMToneResponse] = None
        for attempt in range(2):
            try:
                curr_prompt = prompt if attempt == 0 else prompt + "\n\nNOTE: Previous output was invalid JSON. Return strictly matching JSON."
                raw = llm.generate_json(curr_prompt, TONE_SCHEMA)
                if raw and isinstance(raw, dict):
                    parsed = LLMToneResponse.model_validate(raw)
                    break
            except Exception as exc:
                err_str = str(exc).lower()
                if "429" in err_str or "quota" in err_str or "resourceexhausted" in err_str:
                    logger.warning("LLM quota exceeded / 429 error in tone check. Falling back to regex.")
                    return regex_issues
                if attempt == 1:
                    logger.error("Tone check validation failed after retry: %s", exc)

        if parsed is None:
            # Fall back to regex
            return regex_issues

        # Build issues from LLM output
        llm_issues: list[Issue] = []
        for item in parsed.issues:
            loc = find_quote_location(content, item.quote)
            evidence = IssueEvidence(
                source_doc=item.source_doc or "Voice Guide",
                quote=item.guideline_quote or "Nimbus Bank brand voice guidelines",
                rule_id=item.rule_id or "TONE-001",
            )
            llm_issues.append(
                Issue(
                    id=str(uuid4()),
                    review_id=review_id,
                    category="tone",
                    severity=item.severity,
                    location=loc,
                    message=item.message,
                    evidence=evidence,
                    suggestion=item.suggestion or "Rewrite using professional language.",
                    status="open",
                )
            )

        # Merge with regex issues without duplicates
        merged: list[Issue] = list(llm_issues)
        if regex_issues:
            for reg_issue in regex_issues:
                # Check if already covered by an LLM issue
                covered = False
                for llm_issue in llm_issues:
                    if llm_issue.location and reg_issue.location:
                        if (
                            llm_issue.location.start == reg_issue.location.start
                            and llm_issue.location.end == reg_issue.location.end
                        ):
                            covered = True
                            break
                    # Also check if quote or message overlaps
                    if "casual" in llm_issue.message.lower() and "casual" in reg_issue.message.lower():
                        covered = True
                        break
                if not covered:
                    merged.append(reg_issue)

        # If LLM returned nothing and regex returned something, use regex
        result = merged if merged else regex_issues
        set_cached(cache_key, result)
        return result

    except Exception as exc:
        logger.error("Unexpected error in tone check: %s", exc)
        return _run_regex(content, context.get("review_id", ""))
