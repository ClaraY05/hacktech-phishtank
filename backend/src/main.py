"""FastAPI app for AI Safe Link Sandbox."""

from __future__ import annotations

import base64
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from gemma_client import GemmaClient
from k2_client import K2Client
from orchestrator import analyze_link
from sandbox import CaptureError, capture, shutdown_browser


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    await shutdown_browser()


app = FastAPI(title="AI Safe Link Backend", lifespan=lifespan)


class AnalyzeLinkRequest(BaseModel):
    url: str = Field(..., description="The URL to capture and analyze.")
    sandbox_signals: dict[str, Any] | None = Field(
        default=None,
        description=(
            "Optional caller-provided sandbox signals. Merged on top of "
            "anything the in-process Playwright sandbox produces."
        ),
    )


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
    return {"status": "ok"}


@app.post("/analyze-link")
async def analyze_link_route(payload: AnalyzeLinkRequest) -> dict[str, Any]:
    """Capture the URL with Playwright, then run the Gemma -> K2 pipeline."""
    try:
        gemma = _get_gemma_client()
        k2 = _get_k2_client()
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    try:
        sandbox_result = await capture(payload.url)
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

    result = await analyze_link(
        url=payload.url,
        screenshot=screenshot,
        sandbox_signals=sandbox_signals,
        gemma=gemma,
        k2=k2,
    )
    return result.to_dict()
