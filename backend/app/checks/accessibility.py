"""Accessibility check — P1 stub, always returns no issues."""
from __future__ import annotations

from app.models.schemas import Issue


def run(content: str, context: dict) -> list[Issue]:
    """P1 stub: accessibility checks not yet implemented."""
    return []
