"""Orchestrator — runs all checks in parallel via asyncio.gather."""
from __future__ import annotations

import asyncio
import logging
from typing import Callable

from app.checks import tone, facts, claims, accessibility, visual
from app.models.schemas import Issue

logger = logging.getLogger(__name__)

_CHECK_FUNCTIONS: list[Callable[[str, dict], list[Issue]]] = [
    tone.run,
    facts.run,
    claims.run,
    accessibility.run,
    visual.run,
]


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
