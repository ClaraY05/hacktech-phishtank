"""
Analysis-result cache with single-flight coalescing.

The browser-extension UX hits ``/analyze-link`` many times for the same URL
(every link hover). We don't want each hover to re-spin Playwright + Gemma
+ K2. Two layers solve that:

* ``TTLCache`` keeps a bounded set of {canonical_url -> analyzed_result}
  with a per-entry TTL. Lazy expiry on access keeps the implementation
  small (no background sweeper).

* ``AnalysisCache.get_or_compute()`` adds **single-flight** coalescing:
  if 50 concurrent requests ask for the same URL while it's being
  analyzed, only one runs the heavy pipeline; the other 49 await the
  same future. This is the dominant win for the extension's hover
  pattern.

Cache is in-process. Multi-worker uvicorn deployments will lose
coherence between workers; the right upgrade is to swap ``TTLCache``
for a Redis client behind the same ``AnalysisCache`` interface.
"""

from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import urlparse, urlunparse


def canonicalize_url(url: str) -> str:
    """Stable cache key.

    Lowercases scheme + host, strips default ports and the URL fragment,
    leaves path / query untouched (paths are case-sensitive on most
    servers and query params often matter for the verdict).
    """
    parsed = urlparse(url.strip())
    scheme = (parsed.scheme or "http").lower()
    host = (parsed.hostname or "").lower()
    port = parsed.port
    if (scheme == "http" and port == 80) or (scheme == "https" and port == 443):
        port = None
    netloc = f"{host}:{port}" if port is not None else host
    if parsed.username or parsed.password:
        # Drop user-info from cache key; if a caller embeds credentials
        # they should still hit the same cached verdict.
        creds = parsed.username or ""
        if parsed.password:
            creds += f":{parsed.password}"
        netloc = netloc.replace(f"{creds}@", "", 1)
    return urlunparse((scheme, netloc, parsed.path or "/", parsed.params, parsed.query, ""))


class TTLCache:
    """Bounded LRU + TTL cache. Lazy expiry on access."""

    def __init__(self, *, max_entries: int, ttl_seconds: float) -> None:
        self.max_entries = max_entries
        self.ttl_seconds = ttl_seconds
        self._data: OrderedDict[str, tuple[float, Any]] = OrderedDict()

    def get(self, key: str) -> Any | None:
        item = self._data.get(key)
        if item is None:
            return None
        expires, value = item
        if time.monotonic() >= expires:
            self._data.pop(key, None)
            return None
        self._data.move_to_end(key)
        return value

    def set(self, key: str, value: Any) -> None:
        self._data[key] = (time.monotonic() + self.ttl_seconds, value)
        self._data.move_to_end(key)
        while len(self._data) > self.max_entries:
            self._data.popitem(last=False)

    def pop(self, key: str) -> bool:
        return self._data.pop(key, None) is not None

    def __len__(self) -> int:
        return len(self._data)


class AnalysisCache:
    """TTL cache + single-flight coalescing for analysis results."""

    def __init__(self, *, max_entries: int, ttl_seconds: float) -> None:
        self._cache = TTLCache(max_entries=max_entries, ttl_seconds=ttl_seconds)
        self._inflight: dict[str, asyncio.Future[Any]] = {}
        self._lock = asyncio.Lock()
        self.hits = 0
        self.misses = 0
        self.coalesced = 0

    async def get_or_compute(
        self,
        key: str,
        factory: Callable[[], Awaitable[Any]],
    ) -> tuple[Any, str]:
        """Return ``(result, status)`` where status is hit | coalesced | miss."""
        async with self._lock:
            cached = self._cache.get(key)
            if cached is not None:
                self.hits += 1
                return cached, "hit"
            existing = self._inflight.get(key)
            if existing is not None:
                self.coalesced += 1
                fut: asyncio.Future[Any] = existing
                coalesced = True
            else:
                fut = asyncio.get_event_loop().create_future()
                self._inflight[key] = fut
                coalesced = False

        if coalesced:
            return await fut, "coalesced"

        try:
            result = await factory()
        except BaseException as exc:
            async with self._lock:
                self._inflight.pop(key, None)
            if not fut.done():
                fut.set_exception(exc)
            raise

        async with self._lock:
            self._cache.set(key, result)
            self._inflight.pop(key, None)
            self.misses += 1
        if not fut.done():
            fut.set_result(result)
        return result, "miss"

    def invalidate(self, key: str) -> bool:
        return self._cache.pop(key)

    def stats(self) -> dict[str, Any]:
        return {
            "size": len(self._cache),
            "max_entries": self._cache.max_entries,
            "ttl_seconds": self._cache.ttl_seconds,
            "inflight": len(self._inflight),
            "hits": self.hits,
            "misses": self.misses,
            "coalesced": self.coalesced,
        }
