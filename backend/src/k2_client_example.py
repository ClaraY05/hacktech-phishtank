"""
K2 Think V2 API example client template.

This module is a scaffold to show request structure in the backend.
Adjust endpoint path/payload fields to the latest K2 API docs before production use.
"""

from __future__ import annotations

import os
from typing import Any

import httpx


class K2Client:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
    ) -> None:
        self.api_key = api_key or os.getenv("K2_API_KEY", "")
        self.base_url = (base_url or os.getenv("K2_BASE_URL", "https://api.k2think.ai")).rstrip("/")
        self.model = model or os.getenv("K2_MODEL", "k2-think-v2")

        if not self.api_key:
            raise ValueError("K2_API_KEY is not set.")

    async def analyze_signals(self, sandbox_signals: dict[str, Any]) -> dict[str, Any]:
        """
        Sends sandbox signals to a K2-style chat completion endpoint.

        This is intentionally a template and should be adapted to the official K2 API
        contract (URL path, schema, and response fields).
        """
        endpoint = f"{self.base_url}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a link safety analyst. Given sandbox telemetry for a URL, "
                        "return JSON with risk, score, explanation, and key_signals."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "Analyze the following sandbox output and return a concise JSON result:\n"
                        f"{sandbox_signals}"
                    ),
                },
            ],
            "temperature": 0.1,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(endpoint, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        # Most chat APIs return generated output in choices[0].message.content.
        # Keep raw data for now; parse/validate with pydantic in production.
        return data


async def example_usage() -> dict[str, Any]:
    example_sandbox_output = {
        "url": "http://example-suspicious.test/login",
        "final_url": "http://example-suspicious.test/login",
        "redirect_chain": ["http://example-suspicious.test/login"],
        "num_requests": 21,
        "external_domains": ["cdn.example-suspicious.test", "tracker.bad-domain.test"],
        "dom_signals": {"has_password_form": True, "brand_mismatch": True},
    }

    client = K2Client()
    return await client.analyze_signals(example_sandbox_output)
