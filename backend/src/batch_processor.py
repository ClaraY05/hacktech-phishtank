"""Batch link processor: runs URLs through Playwright -> Gemma -> K2 concurrently.

Yields one result dict per URL as each finishes (order not guaranteed).
Errors per URL are returned as result dicts rather than raised so the stream
is never interrupted by a single bad URL.
"""
from __future__ import annotations

import asyncio
import base64
import logging
from collections.abc import AsyncIterator
from typing import Any

from cache import AnalysisCache, canonicalize_url
from gemma_client import GemmaClient
from k2_client import K2Client
from orchestrator import analyze_link
from sandbox import CaptureError
from sandbox_backend import SandboxBackend

logger = logging.getLogger(__name__)

MAX_CONCURRENT = 5  # matches sandbox.py MAX_CONCURRENT_BROWSERS


async def process_links_stream(
    urls: list[str],
    *,
    backend: SandboxBackend,
    cache: AnalysisCache,
    gemma: GemmaClient,
    k2: K2Client,
) -> AsyncIterator[dict[str, Any]]:
    """Process each URL through Playwright -> Gemma -> K2.

    Yields one result dict as each URL finishes. Concurrent load is capped at
    MAX_CONCURRENT to match the Playwright browser semaphore in sandbox.py.
    """
    if not urls:
        return

    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

    async def process_one(url: str) -> None:
        result: dict[str, Any] = _error_result(url, "unknown error")
        try:
            async with semaphore:
                key = canonicalize_url(url)

                async def factory() -> dict[str, Any]:
                    try:
                        sandbox_result = await backend(url)
                    except CaptureError as exc:
                        logger.warning("capture failed %s: %s", url, exc)
                        return _error_result(url, str(exc))

                    encoded = sandbox_result.get("screenshot_b64")
                    if not encoded:
                        err = sandbox_result.get("error") or f"no screenshot for {url}"
                        logger.warning("no screenshot %s: %s", url, err)
                        return _error_result(url, err)

                    screenshot = base64.b64decode(encoded)
                    sandbox_signals = {
                        k: v for k, v in sandbox_result.items() if k != "screenshot_b64"
                    }

                    analyzed = await analyze_link(
                        url=url,
                        screenshot=screenshot,
                        sandbox_signals=sandbox_signals,
                        gemma=gemma,
                        k2=k2,
                    )
                    return analyzed.to_dict()

                result, status = await cache.get_or_compute(key, factory)
                logger.info(
                    "done url=%s cache=%s risk=%s score=%s",
                    url, status, result.get("risk"), result.get("score"),
                )
        except asyncio.CancelledError:
            result = _error_result(url, "cancelled")
            raise
        except Exception as exc:  # noqa: BLE001
            logger.error("pipeline error for %s: %s", url, exc)
            result = _error_result(url, str(exc))
        finally:
            await queue.put(result)

    tasks = [asyncio.create_task(process_one(url)) for url in urls]

    for _ in urls:
        yield await queue.get()

    await asyncio.gather(*tasks, return_exceptions=True)


def _error_result(url: str, reason: str) -> dict[str, Any]:
    return {
        "url": url,
        "risk": "UNKNOWN",
        "score": 0,
        "explanation": reason,
        "key_signals": [],
        "error": reason,
    }
