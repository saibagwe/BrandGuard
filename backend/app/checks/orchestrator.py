"""Orchestrator — runs all checks in parallel via asyncio.gather and builds context from db."""
from __future__ import annotations

import asyncio
import logging
from typing import Callable, Optional

from sqlalchemy.orm import Session

from app.checks import tone, facts, claims, accessibility, visual
from app.models.schemas import Issue
from app.checks.defaults import DEFAULT_VOICE_GUIDE, DEFAULT_TERMINOLOGY, DEFAULT_APPROVED_FACTS
from app.checks.utils import compute_context_version

logger = logging.getLogger(__name__)

_CHECK_FUNCTIONS: list[Callable[[str, dict], list[Issue]]] = [
    tone.run,
    facts.run,
    claims.run,
    accessibility.run,
    visual.run,
]


def build_context_from_db(db: Optional[Session] = None, review_id: str = "", review_title: str = "") -> dict:
    """Build review context dictionary from stored GuidelineDoc records in db.
    
    If no documents exist, returns an empty context with has_guidelines=False.
    Computes a context_version hash so check caching invalidates on guideline changes.
    """
    if db is None:
        context_version = compute_context_version(DEFAULT_VOICE_GUIDE, DEFAULT_TERMINOLOGY, DEFAULT_APPROVED_FACTS)
        return {
            "review_id": review_id,
            "review_title": review_title,
            "voice_guide": DEFAULT_VOICE_GUIDE,
            "terminology": DEFAULT_TERMINOLOGY,
            "facts": DEFAULT_APPROVED_FACTS,
            "has_guidelines": bool(DEFAULT_VOICE_GUIDE or DEFAULT_TERMINOLOGY or DEFAULT_APPROVED_FACTS),
            "context_version": context_version,
        }

    from app.models.db import GuidelineDoc

    docs = db.query(GuidelineDoc).all()

    voice_docs = [d.content_text for d in docs if d.doc_type == "voice" and d.content_text]
    term_docs = [d.content_text for d in docs if d.doc_type == "terminology" and d.content_text]
    fact_docs = [d.content_text for d in docs if d.doc_type == "facts" and d.content_text]

    voice_guide = "\n\n".join(voice_docs) if voice_docs else DEFAULT_VOICE_GUIDE
    terminology = "\n\n".join(term_docs) if term_docs else DEFAULT_TERMINOLOGY
    facts_str = "\n\n".join(fact_docs) if fact_docs else DEFAULT_APPROVED_FACTS

    has_guidelines = bool(voice_guide or terminology or facts_str)
    context_version = compute_context_version(voice_guide, terminology, facts_str)

    return {
        "review_id": review_id,
        "review_title": review_title,
        "voice_guide": voice_guide,
        "terminology": terminology,
        "facts": facts_str,
        "has_guidelines": has_guidelines,
        "context_version": context_version,
    }


async def run_all_checks(content: str, context: dict) -> list[Issue]:
    """Run every check function in parallel. Swallows individual failures."""

    async def _safe_run(fn: Callable[[str, dict], list[Issue]]) -> list[Issue]:
        try:
            return await asyncio.to_thread(fn, content, context)
        except Exception as exc:
            logger.error("Check %s failed: %s", fn.__name__, exc)
            return []

    results = await asyncio.gather(*[_safe_run(fn) for fn in _CHECK_FUNCTIONS])

    merged: list[Issue] = []
    for result in results:
        merged.extend(result)
    return merged
