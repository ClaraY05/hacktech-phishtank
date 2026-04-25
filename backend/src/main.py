"""FastAPI app for AI Safe Link Sandbox.

The request path is intentionally thin:

    /analyze-link
        -> AnalysisCache.get_or_compute(canonical_url, factory)
              -> SandboxBackend(url)              # in-process or podman
              -> orchestrator.analyze_link(...)   # Gemma -> K2

    /send-batch-links
        -> receives all links from the Chrome extension
        -> dispatches each URL through the analyze-link pipeline

Both the sandbox backend and the cache are pluggable. See
``sandbox_backend.get_backend`` and ``cache.AnalysisCache``.
"""
from __future__ import annotations

import base64
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, HttpUrl

from batch_processor import process_links_stream
from cache import AnalysisCache, canonicalize_url
from gemma_client import GemmaClient
from k2_client import K2Client
from orchestrator import analyze_link
from sandbox import CaptureError
from sandbox_backend import SandboxBackend, get_backend

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    backend: SandboxBackend = get_backend()
    cache = AnalysisCache(
        max_entries=int(os.getenv("ANALYSIS_CACHE_MAX", "10000")),
        ttl_seconds=float(os.getenv("ANALYSIS_CACHE_TTL_S", "3600")),
    )
    app.state.sandbox_backend = backend
    app.state.cache = cache
    try:
        yield
    finally:
        await backend.aclose()


app = FastAPI(title="AI Safe Link Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LinkInput(BaseModel):
    url: HttpUrl
    text: str


class AnalyzeLinksRequest(BaseModel):
    page_url: HttpUrl
    links: list[LinkInput]
    dom_signals: dict | None = None
    sanitized_html_excerpt: str | None = None
    content_hash_hint: str | None = None


class AnalyzeLinkRequest(BaseModel):
    url: str = Field(..., description="The URL to capture and analyze.")
    sandbox_signals: dict[str, Any] | None = Field(
        default=None,
        description=(
            "Optional caller-provided sandbox signals. Merged on top of "
            "anything the sandbox backend produces."
        ),
    )
    force_refresh: bool = Field(
        default=False,
        description="If true, bypass the analysis cache and re-run the pipeline.",
    )


class InvalidateRequest(BaseModel):
    url: str


_gemma_client: GemmaClient | None = None
_k2_client: K2Client | None = None


def _get_gemma_client() -> GemmaClient:
    global _gemma_client
    if _gemma_client is None:
        _gemma_client = GemmaClient()
    return _gemma_client


def _get_k2_client() -> K2Client:
    global _k2_client
    if _k2_client is None:
        _k2_client = K2Client()
    return _k2_client


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "sandbox_backend": getattr(app.state.sandbox_backend, "name", "unknown"),
    }


@app.get("/cache/stats")
def cache_stats() -> dict[str, Any]:
    cache: AnalysisCache = app.state.cache
    return cache.stats()


@app.post("/cache/invalidate")
def cache_invalidate(payload: InvalidateRequest) -> dict[str, Any]:
    cache: AnalysisCache = app.state.cache
    key = canonicalize_url(payload.url)
    return {"invalidated": cache.invalidate(key), "key": key}


@app.post("/send-batch-links")
async def send_batch_links(payload: AnalyzeLinksRequest) -> StreamingResponse:
    logger.info("=== /send-batch-links received ===")
    logger.info("  page_url=%s", payload.page_url)
    logger.info("  link_count=%d  unique=%d", len(payload.links), len(set(str(l.url) for l in payload.links)))
    logger.info("  dom_signals=%s", payload.dom_signals)
    logger.info("  html_chars=%d  content_hash_hint=%s", len(payload.sanitized_html_excerpt or ""), payload.content_hash_hint)
    for i, link in enumerate(payload.links):
        logger.info("  [%d] url=%s  text=%r", i, link.url, link.text)

    unique_urls = list(dict.fromkeys(str(link.url) for link in payload.links))

    try:
        gemma = _get_gemma_client()
        k2 = _get_k2_client()
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    backend: SandboxBackend = app.state.sandbox_backend
    cache: AnalysisCache = app.state.cache

    async def event_stream():
        async for result in process_links_stream(
            unique_urls,
            backend=backend,
            cache=cache,
            gemma=gemma,
            k2=k2,
        ):
            yield f"data: {json.dumps(result)}\n\n"
        yield 'data: {"done": true}\n\n'

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/analyze-link")
async def analyze_link_route(payload: AnalyzeLinkRequest) -> dict[str, Any]:
    """Capture the URL via the active sandbox backend, then run Gemma -> K2.

    Results are cached by canonicalized URL with single-flight coalescing
    so concurrent hovers on the same link only run the pipeline once.
    """
    try:
        gemma = _get_gemma_client()
        k2 = _get_k2_client()
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    backend: SandboxBackend = app.state.sandbox_backend
    cache: AnalysisCache = app.state.cache
    key = canonicalize_url(payload.url)

    if payload.force_refresh:
        cache.invalidate(key)

    async def factory() -> dict[str, Any]:
        try:
            sandbox_result = await backend(payload.url)
        except CaptureError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        encoded = sandbox_result.get("screenshot_b64")
        if not encoded:
            raise HTTPException(
                status_code=502,
                detail=sandbox_result.get("error")
                or f"sandbox produced no screenshot for {payload.url}",
            )
        screenshot = base64.b64decode(encoded)

        sandbox_signals: dict[str, Any] = {
            k: v for k, v in sandbox_result.items() if k != "screenshot_b64"
        }
        if payload.sandbox_signals:
            sandbox_signals.update(payload.sandbox_signals)

        analyzed = await analyze_link(
            url=payload.url,
            screenshot=screenshot,
            sandbox_signals=sandbox_signals,
            gemma=gemma,
            k2=k2,
        )
        return analyzed.to_dict()

    result, status = await cache.get_or_compute(key, factory)
    return {**result, "_cache": status, "_cache_key": key}
