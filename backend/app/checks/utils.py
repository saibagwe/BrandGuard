"""Utility functions for check modules."""
from __future__ import annotations

import hashlib
from typing import Optional, Union, List
from app.models.schemas import IssueLocation


def find_quote_location(content: str, quote: str) -> Optional[IssueLocation]:
    """Find location {start, end} in content for quote.
    
    Tries exact match first, then case-insensitive match.
    Never trusts LLM-reported offsets. Returns None if not found.
    """
    if not quote or not content:
        return None

    # 1. Exact match
    idx = content.find(quote)
    if idx != -1:
        return IssueLocation(start=idx, end=idx + len(quote))

    # 2. Case-insensitive match
    lower_content = content.lower()
    lower_quote = quote.lower()
    idx = lower_content.find(lower_quote)
    if idx != -1:
        return IssueLocation(start=idx, end=idx + len(quote))

    return None


def format_context_field(value: Union[str, List[str], None], default: str = "") -> str:
    """Normalize context field to string."""
    if value is None:
        return default
    if isinstance(value, list):
        return "\n".join(str(item) for item in value if item)
    return str(value).strip() or default


def compute_context_version(*fields: str) -> str:
    """Compute short SHA256 hash of context fields."""
    h = hashlib.sha256()
    for field in fields:
        h.update(field.encode("utf-8"))
        h.update(b"||")
    return h.hexdigest()[:16]
