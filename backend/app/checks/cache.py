"""In-memory cache for LLM check results to conserve quota."""
from __future__ import annotations

import hashlib
import time
from typing import Any, Optional

_CACHE: dict[str, tuple[float, Any]] = {}
DEFAULT_TTL_SECONDS = 300.0  # 5 minutes


def make_cache_key(check_name: str, content: str, context_version: str) -> str:
    """Generate SHA256 cache key from check name, content, and context version."""
    h = hashlib.sha256()
    h.update(check_name.encode("utf-8"))
    h.update(b"::")
    h.update(content.encode("utf-8"))
    h.update(b"::")
    h.update(context_version.encode("utf-8"))
    return h.hexdigest()


def get_cached(key: str) -> Optional[Any]:
    """Retrieve unexpired value from cache, or None."""
    now = time.time()
    if key in _CACHE:
        expires_at, val = _CACHE[key]
        if now < expires_at:
            return val
        del _CACHE[key]
    return None


def set_cached(key: str, value: Any, ttl: float = DEFAULT_TTL_SECONDS) -> None:
    """Store value in cache with TTL in seconds."""
    now = time.time()
    # Prune expired entries if cache is growing large
    if len(_CACHE) > 500:
        expired = [k for k, (exp, _) in _CACHE.items() if now >= exp]
        for k in expired:
            del _CACHE[k]
    _CACHE[key] = (now + ttl, value)


def clear_cache() -> None:
    """Clear all cached entries."""
    _CACHE.clear()
