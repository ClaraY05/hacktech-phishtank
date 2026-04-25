"""
Gemma vision client (Google AI Studio / Gemini API).

Thin async wrapper around Google's Generative Language API for the Gemma
model family. Designed as the vision-preprocessing stage in the
AI Safe Link pipeline:

    Playwright screenshot  ->  GemmaClient.score_screenshot  ->  K2 V2

API shape (Google AI Studio):
    POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
    Header: x-goog-api-key: <GEMINI_API_KEY>

Run as a script to smoke-test your API key against a local image:
    python src/gemma_client.py path/to/screenshot.png
    python src/gemma_client.py path/to/screenshot.png --url https://example.com
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import mimetypes
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com"
# Gemma 4 model IDs available through the Gemini API (April 2026):
#   - gemma-4-26b-a4b-it  (Mixture-of-Experts, 4B active params, default here)
#   - gemma-4-31b-it      (dense "Effective" variant)
# Both support multimodal (text + image) input.
DEFAULT_MODEL = "gemma-4-26b-a4b-it"

ImageInput = bytes | str | Path


_VISION_PROMPT = """You are a security analyst examining a screenshot of a webpage that a user is about to visit.

Analyze the screenshot for visual indicators of phishing, scams, malware,
fake login pages, brand impersonation, deceptive UI patterns, or other
visual security risks.

Respond with STRICT JSON ONLY (no prose, no code fences) matching exactly this schema:
{
  "score": <integer 0-100, where 0 = clearly safe and 100 = clearly malicious>,
  "summary": "<one or two sentence plain-English summary of what you see>",
  "visual_signals": ["<short signal 1>", "<short signal 2>", ...]
}

Guidelines for the score:
  0-29   LOW risk    (legitimate-looking site, no red flags)
  30-69  MEDIUM risk (some suspicious elements, ambiguous)
  70-100 HIGH risk   (clear phishing / scam / impersonation indicators)

Keep visual_signals concise (2-6 items max). Examples of good signals:
  "fake Microsoft login form", "mismatched brand logo", "urgency banner",
  "browser warning impersonation", "credential harvest form".
"""


@dataclass
class GemmaVisionScore:
    """Parsed vision-only risk assessment from Gemma."""

    score: int
    summary: str
    visual_signals: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "summary": self.summary,
            "visual_signals": list(self.visual_signals),
        }


class GemmaClient:
    """Async client for Gemma multimodal generation via Google AI Studio."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float = 120.0,
    ) -> None:
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        self.base_url = (
            base_url or os.getenv("GEMMA_BASE_URL", DEFAULT_BASE_URL)
        ).rstrip("/")
        self.model = model or os.getenv("GEMMA_MODEL", DEFAULT_MODEL)
        self.timeout = timeout

        if not self.api_key:
            raise ValueError(
                "GEMINI_API_KEY is not set. Add it to your environment or backend/.env."
            )

    @property
    def _endpoint(self) -> str:
        return f"{self.base_url}/v1beta/models/{self.model}:generateContent"

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key,
        }

    async def score_screenshot(
        self,
        image: ImageInput,
        *,
        url: str | None = None,
        mime_type: str | None = None,
        extra_context: str | None = None,
    ) -> GemmaVisionScore:
        """Send a screenshot to Gemma and return a structured vision score."""
        image_bytes, resolved_mime = _load_image(image, mime_type)
        b64 = base64.b64encode(image_bytes).decode("ascii")

        prompt_parts = [_VISION_PROMPT]
        if url:
            prompt_parts.append(f"\nThe screenshot was captured from: {url}")
        if extra_context:
            prompt_parts.append(f"\nAdditional context:\n{extra_context}")
        prompt = "".join(prompt_parts)

        payload: dict[str, Any] = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": resolved_mime,
                                "data": b64,
                            }
                        },
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
            },
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                self._endpoint, headers=self._headers, json=payload
            )
            response.raise_for_status()
            data = response.json()

        text = _extract_text(data)
        parsed = _parse_json_object(text)
        return _build_score(parsed, raw=data)


def _load_image(image: ImageInput, mime_type: str | None) -> tuple[bytes, str]:
    """Normalize image input to (bytes, mime_type)."""
    if isinstance(image, bytes):
        return image, mime_type or "image/png"

    if isinstance(image, (str, Path)):
        candidate = Path(image)
        if candidate.exists():
            data = candidate.read_bytes()
            guessed, _ = mimetypes.guess_type(candidate.name)
            return data, mime_type or guessed or "image/png"
        if isinstance(image, str):
            cleaned = image.strip()
            if cleaned.startswith("data:"):
                # data:<mime>;base64,<payload>
                header, _, payload = cleaned.partition(",")
                decoded = base64.b64decode(payload)
                resolved = mime_type
                if not resolved and header.startswith("data:"):
                    resolved = header[5:].split(";")[0] or None
                return decoded, resolved or "image/png"
            return base64.b64decode(cleaned), mime_type or "image/png"

    raise TypeError(f"Unsupported image input: {type(image)!r}")


def _extract_text(data: dict[str, Any]) -> str:
    """Pull assistant text out of a Gemini generateContent response.

    Gemma 4 returns chain-of-thought parts marked with ``"thought": true``
    alongside the final answer part. We only want the final answer, so
    thought parts are skipped.
    """
    candidates = data.get("candidates") or []
    if not candidates:
        return ""
    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    chunks: list[str] = []
    for part in parts:
        if not isinstance(part, dict):
            continue
        if part.get("thought") is True:
            continue
        text = part.get("text")
        if isinstance(text, str):
            chunks.append(text)
    return "".join(chunks)


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)


def _parse_json_object(text: str) -> dict[str, Any]:
    """Tolerantly parse a JSON object, stripping markdown fences if present."""
    if not text:
        return {}
    cleaned = _FENCE_RE.sub("", text).strip()
    try:
        obj = json.loads(cleaned)
    except json.JSONDecodeError:
        # Last-ditch: pull the first {...} block.
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            return {}
        try:
            obj = json.loads(match.group(0))
        except json.JSONDecodeError:
            return {}
    return obj if isinstance(obj, dict) else {}


def _build_score(parsed: dict[str, Any], *, raw: dict[str, Any]) -> GemmaVisionScore:
    score_raw = parsed.get("score", 0)
    try:
        score = int(score_raw)
    except (TypeError, ValueError):
        score = 0
    score = max(0, min(100, score))

    summary = parsed.get("summary") or ""
    if not isinstance(summary, str):
        summary = str(summary)

    signals_raw = parsed.get("visual_signals") or []
    if isinstance(signals_raw, list):
        signals = [str(s) for s in signals_raw if s is not None]
    else:
        signals = [str(signals_raw)]

    return GemmaVisionScore(
        score=score,
        summary=summary.strip(),
        visual_signals=signals,
        raw=raw,
    )


async def _cli(image_path: str, *, url: str | None) -> None:
    client = GemmaClient()
    result = await client.score_screenshot(image_path, url=url)
    print(json.dumps(result.to_dict(), indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Quick Gemma vision smoke test against Google AI Studio."
    )
    parser.add_argument("image", help="Path to a screenshot (PNG/JPEG/WebP).")
    parser.add_argument(
        "--url",
        default=None,
        help="Optional URL the screenshot was captured from (added to the prompt).",
    )
    args = parser.parse_args()

    try:
        asyncio.run(_cli(args.image, url=args.url))
    except httpx.HTTPStatusError as exc:
        print(
            f"HTTP {exc.response.status_code} from Gemini API: {exc.response.text}",
            file=sys.stderr,
        )
        sys.exit(1)
    except ValueError as exc:
        print(f"Config error: {exc}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
