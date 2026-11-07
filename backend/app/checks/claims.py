"""Claims check — detects unsubstantiated superlative and comparative claims.

Uses keyword pre-filtering plus LLM against approved guidelines/facts,
with regex check as fallback and for stub mode.
"""
from __future__ import annotations

import logging
import re
from typing import Optional
from uuid import uuid4
from pydantic import BaseModel

from app.models.schemas import Issue, IssueEvidence, IssueLocation
from app.llm.provider import llm
from app.checks.defaults import DEFAULT_VOICE_GUIDE, DEFAULT_APPROVED_FACTS
from app.checks.cache import make_cache_key, get_cached, set_cached
from app.checks.utils import find_quote_location, format_context_field, compute_context_version

logger = logging.getLogger(__name__)

# Keyword pre-filter for superlatives and unqualified comparisons
_PREFILTER = re.compile(
    r"\b(best|#\s*1|number\s+(?:one|1)|world[\s-]class|fastest|guaranteed|unmatched|industry[\s-]leading|top[\s-]tier|unrivaled|greatest)\b"
    r"|(\b(?:better|faster|more|cheaper)\s+than\b)",
    re.IGNORECASE,
)

# Stub regex patterns
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

CLAIMS_SCHEMA = {
    "type": "object",
    "properties": {
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "quote": {"type": "string", "description": "Exact superlative/comparative claim phrase from content"},
                    "message": {"type": "string", "description": "Explanation explicitly stating that no approved supporting source was found"},
                    "substantiated": {"type": "boolean", "description": "True if an approved document explicitly substantiates this claim, False otherwise"},
                    "source_doc": {"type": "string", "description": "Document name (e.g. Brand Guidelines)"},
                    "rule_id": {"type": "string", "description": "Rule identifier like CLAIM-001"},
                    "suggestion": {"type": "string", "description": "Compliant rewrite keeping the original intent"},
                },
                "required": ["quote", "message", "substantiated", "suggestion"],
            },
        },
    },
    "required": ["claims"],
}


class LLMClaimItem(BaseModel):
    quote: str
    message: str
    substantiated: bool = False
    source_doc: Optional[str] = "Brand Guidelines"
    rule_id: Optional[str] = "CLAIM-001"
    suggestion: Optional[str] = None


class LLMClaimsResponse(BaseModel):
    claims: list[LLMClaimItem]


def _run_regex(content: str, review_id: str) -> list[Issue]:
    """Deterministic fallback regex check."""
    matches = list(_PATTERN.finditer(content))
    if not matches:
        return []

    found_phrases = [m.group() for m in matches]
    count = len(matches)
    severity = "high" if count >= 2 else "medium"
    first = matches[0]

    issue = Issue(
        id=str(uuid4()),
        review_id=review_id,
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


def run(content: str, context: dict) -> list[Issue]:
    """Return claim issues found in *content*."""
    try:
        # Keyword pre-filter: if no claim keywords exist, return [] immediately
        if not _PREFILTER.search(content):
            return []

        review_id = context.get("review_id", "")
        facts = format_context_field(context.get("facts"), DEFAULT_APPROVED_FACTS)
        voice_guide = format_context_field(context.get("voice_guide"), DEFAULT_VOICE_GUIDE)
        approved_docs = f"Brand Voice Guidelines:\n{voice_guide}\n\nApproved Facts:\n{facts}"
        context_version = context.get("context_version") or compute_context_version(approved_docs)

        # In stub mode, immediately return deterministic regex issues
        if getattr(llm, "_stub", True):
            return _run_regex(content, review_id)

        # Check in-memory cache
        cache_key = make_cache_key("claims", content, context_version)
        cached = get_cached(cache_key)
        if cached is not None:
            return cached

        prompt = (
            "You are a brand compliance reviewer evaluating claims in promotional content for Nimbus Bank.\n\n"
            f"Approved Guidelines & Facts:\n{approved_docs}\n\n"
            f"Content to Review:\n\"\"\"{content}\"\"\"\n\n"
            "Task:\n"
            "Evaluate all superlative, comparative, or absolute claims (such as 'best', '#1', 'world-class', 'fastest', 'guaranteed', 'unmatched', 'industry-leading', or unqualified comparisons).\n\n"
            "For each claim:\n"
            "- Check whether any approved document above explicitly substantiates it.\n"
            "- If substantiated: set substantiated = true (DO NOT flag it as a violation).\n"
            "- If NOT substantiated: set substantiated = false.\n"
            "  * message: explicitly state that no approved supporting source was found for this claim\n"
            "  * suggestion: provide a compliant rewrite preserving original intent\n"
            "  * source_doc: 'Brand Guidelines'\n"
            "  * rule_id: 'CLAIM-001'\n\n"
            "If no claims are present or all claims are substantiated, return {\"claims\": []}."
        )

        parsed: Optional[LLMClaimsResponse] = None
        for attempt in range(2):
            try:
                curr_prompt = prompt if attempt == 0 else prompt + "\n\nNOTE: Previous output was invalid JSON. Return strictly matching JSON."
                raw = llm.generate_json(curr_prompt, CLAIMS_SCHEMA)
                if raw and isinstance(raw, dict):
                    parsed = LLMClaimsResponse.model_validate(raw)
                    break
            except Exception as exc:
                err_str = str(exc).lower()
                if "429" in err_str or "quota" in err_str or "resourceexhausted" in err_str:
                    logger.warning("LLM quota exceeded / 429 error in claims check. Falling back to regex.")
                    return _run_regex(content, review_id)
                if attempt == 1:
                    logger.error("Claims check validation failed after retry: %s", exc)

        if parsed is None:
            return _run_regex(content, review_id)

        issues: list[Issue] = []
        for item in parsed.claims:
            # Do not flag substantiated claims
            if item.substantiated:
                continue

            loc = find_quote_location(content, item.quote)
            message = item.message
            if "no approved supporting source" not in message.lower() and "no approved source" not in message.lower():
                message = f"Unsubstantiated claim '{item.quote}': No approved supporting source was found in guidelines."

            evidence = IssueEvidence(
                source_doc=item.source_doc or "Brand Guidelines",
                quote="All comparative or superlative claims must be substantiated with verified data.",
                rule_id=item.rule_id or "CLAIM-001",
            )

            issues.append(
                Issue(
                    id=str(uuid4()),
                    review_id=review_id,
                    category="claim",
                    severity="high",
                    location=loc,
                    message=message,
                    evidence=evidence,
                    suggestion=item.suggestion or "Remove or qualify claim with verified data.",
                    status="open",
                )
            )

        set_cached(cache_key, issues)
        return issues

    except Exception as exc:
        logger.error("Unexpected error in claims check: %s", exc)
        return _run_regex(content, context.get("review_id", ""))
