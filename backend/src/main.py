"""FastAPI app for AI Safe Link Sandbox."""
import logging

from __future__ import annotations

import base64
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl, Field

from gemma_client import GemmaClient
from k2_client import K2Client
from orchestrator import analyze_link

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


app = FastAPI(title="AI Safe Link Backend")

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


@app.post("/analyze-links")
def analyze_links(payload: AnalyzeLinksRequest) -> dict:
    # logger.info("=== /analyze-links received ===")
    # logger.info("  page_url=%s", payload.page_url)
    # logger.info("  link_count=%d  unique=%d", len(payload.links), len(set(str(l.url) for l in payload.links)))
    # logger.info("  dom_signals=%s", payload.dom_signals)
    # logger.info("  html_chars=%d  content_hash_hint=%s", len(payload.sanitized_html_excerpt or ""), payload.content_hash_hint)
    # for i, link in enumerate(payload.links):
    #     logger.info("  [%d] url=%s  text=%r", i, link.url, link.text)

    unique_urls = list(dict.fromkeys(str(link.url) for link in payload.links))
    dom_signals = payload.dom_signals or {}
    html_excerpt = payload.sanitized_html_excerpt or ""

    results = [
        {
            "url": url,
            "risk": "UNKNOWN",
            "score": 0,
            "explanation": "Scaffold response. K2 reasoning not wired yet.",
            "redirect_chain": [url],
        }
        for url in unique_urls
    ]

    return {
        "ok": True,
        "page_url": str(payload.page_url),
        "total_links": len(payload.links),
        "unique_links": len(unique_urls),
        "received_dom_signals": dom_signals,
        "received_html_chars": len(html_excerpt),
        "received_content_hash_hint": payload.content_hash_hint,
        "results": results,
    }
