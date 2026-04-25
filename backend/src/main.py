"""FastAPI app for AI Safe Link Sandbox."""

from __future__ import annotations

import base64
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from gemma_client import GemmaClient
from k2_client import K2Client
from orchestrator import analyze_link


app = FastAPI(title="AI Safe Link Backend")


class AnalyzeLinkRequest(BaseModel):
    url: str = Field(..., description="The URL the screenshot was captured from.")
    screenshot_b64: str = Field(
        ...,
        description="Base64-encoded screenshot bytes (PNG/JPEG/WebP). "
        "Accepts a raw base64 string or a 'data:<mime>;base64,...' data URL.",
    )
    sandbox_signals: dict[str, Any] | None = Field(
        default=None,
        description="Optional structured signals from the Playwright sandbox layer.",
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
    """Run the Gemma -> K2 pipeline for a single URL + screenshot.

    Playwright is not yet wired in; the caller (or a test harness) provides
    the screenshot directly as base64.
    """
    try:
        gemma = _get_gemma_client()
        k2 = _get_k2_client()
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    raw = payload.screenshot_b64.strip()
    if raw.startswith("data:"):
        screenshot: bytes | str = raw
    else:
        try:
            screenshot = base64.b64decode(raw, validate=True)
        except (ValueError, base64.binascii.Error) as exc:
            raise HTTPException(
                status_code=400, detail=f"Invalid base64 screenshot: {exc}"
            ) from exc

    result = await analyze_link(
        url=payload.url,
        screenshot=screenshot,
        sandbox_signals=payload.sandbox_signals,
        gemma=gemma,
        k2=k2,
    )
    return result.to_dict()
