"""
Two-stage AI orchestration for AI Safe Link Sandbox.

Pipeline:
    URL + screenshot  ->  GemmaClient.score_screenshot   (vision-only score)
                      ->  K2Client.chat                  (final risk verdict)
                      ->  UnifiedRiskResponse

Playwright integration is intentionally out of scope here; the screenshot
(and any optional sandbox signals) are passed in by the caller.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from typing import Any

from gemma_client import GemmaClient, GemmaVisionScore, ImageInput
from k2_client import K2Client


VALID_RISK_LEVELS = ("LOW", "MEDIUM", "HIGH")


@dataclass
class UnifiedRiskResponse:
    """Final response shape returned to the extension/backend caller."""

    url: str
    risk: str
    score: int
    explanation: str
    key_signals: list[str] = field(default_factory=list)
    gemma_vision: GemmaVisionScore | None = None

    def to_dict(self) -> dict[str, Any]:
        data = {
            "url": self.url,
            "risk": self.risk,
            "score": self.score,
            "explanation": self.explanation,
            "key_signals": list(self.key_signals),
        }
        if self.gemma_vision is not None:
            vision = asdict(self.gemma_vision)
            vision.pop("raw", None)
            data["gemma_vision"] = vision
        return data


_K2_SYSTEM_PROMPT = (
    "You are the final risk-reasoning stage of a web-link safety pipeline. "
    "You receive (1) a URL, (2) a vision-only assessment from a Gemma model "
    "that looked at a screenshot of the page, and optionally (3) structured "
    "sandbox signals from a headless browser. Combine these into a single, "
    "consistent verdict. Always respond with strict JSON only."
)


async def analyze_link(
    url: str,
    screenshot: ImageInput,
    *,
    sandbox_signals: dict[str, Any] | None = None,
    gemma: GemmaClient | None = None,
    k2: K2Client | None = None,
) -> UnifiedRiskResponse:
    """Run the Gemma -> K2 pipeline for a single URL + screenshot."""
    gemma_client = gemma or GemmaClient()
    k2_client = k2 or K2Client()

    vision = await gemma_client.score_screenshot(screenshot, url=url)

    user_prompt = _build_k2_prompt(
        url=url, vision=vision, sandbox_signals=sandbox_signals
    )

    chat_result = await k2_client.chat(
        [
            {"role": "system", "content": _K2_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.1,
    )

    parsed = _parse_k2_json(chat_result.content)
    return _build_unified_response(url=url, vision=vision, parsed=parsed)


def _build_k2_prompt(
    *,
    url: str,
    vision: GemmaVisionScore,
    sandbox_signals: dict[str, Any] | None,
) -> str:
    sandbox_block = (
        json.dumps(sandbox_signals, indent=2)
        if sandbox_signals
        else "(none provided yet -- Playwright integration pending)"
    )

    return f"""Evaluate the following link for safety.

URL:
{url}

Gemma vision assessment (from a screenshot of the rendered page):
{json.dumps(vision.to_dict(), indent=2)}

Sandbox signals:
{sandbox_block}

Respond with STRICT JSON ONLY, no prose, no code fences, matching this schema:
{{
  "risk": "LOW" | "MEDIUM" | "HIGH",
  "score": <integer 0-100>,
  "explanation": "<2-4 sentence human-readable explanation>",
  "key_signals": ["<short signal>", "<short signal>", ...]
}}

Score guidance:
  0-29   -> LOW
  30-69  -> MEDIUM
  70-100 -> HIGH

Treat the Gemma vision score as a strong prior but reason about the URL
and any sandbox signals as well. If signals disagree, briefly acknowledge
that in the explanation.
"""


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)


def _parse_k2_json(text: str) -> dict[str, Any]:
    """Tolerantly parse K2's JSON output, stripping markdown fences if present."""
    if not text:
        return {}
    cleaned = _FENCE_RE.sub("", text).strip()
    try:
        obj = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            return {}
        try:
            obj = json.loads(match.group(0))
        except json.JSONDecodeError:
            return {}
    return obj if isinstance(obj, dict) else {}


def _build_unified_response(
    *,
    url: str,
    vision: GemmaVisionScore,
    parsed: dict[str, Any],
) -> UnifiedRiskResponse:
    score_raw = parsed.get("score", vision.score)
    try:
        score = int(score_raw)
    except (TypeError, ValueError):
        score = vision.score
    score = max(0, min(100, score))

    risk = parsed.get("risk")
    if not isinstance(risk, str) or risk.upper() not in VALID_RISK_LEVELS:
        risk = _risk_from_score(score)
    else:
        risk = risk.upper()

    explanation = parsed.get("explanation") or vision.summary or ""
    if not isinstance(explanation, str):
        explanation = str(explanation)

    signals_raw = parsed.get("key_signals") or []
    if isinstance(signals_raw, list):
        signals = [str(s) for s in signals_raw if s is not None]
    else:
        signals = [str(signals_raw)]

    return UnifiedRiskResponse(
        url=url,
        risk=risk,
        score=score,
        explanation=explanation.strip(),
        key_signals=signals,
        gemma_vision=vision,
    )


def _risk_from_score(score: int) -> str:
    if score >= 70:
        return "HIGH"
    if score >= 30:
        return "MEDIUM"
    return "LOW"


__all__ = [
    "UnifiedRiskResponse",
    "analyze_link",
    "ImageInput",
]
