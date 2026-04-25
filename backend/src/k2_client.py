"""
K2 Think V2 API client.

Thin async wrapper around the K2 Think V2 chat-completions endpoint.

API reference (from IFM / MBZUAI):
    POST https://api.k2think.ai/v1/chat/completions
    model: "MBZUAI-IFM/K2-Think-v2"

Run as a script to smoke-test your API key:
    python src/k2_client.py "hi there"
    python src/k2_client.py --stream "Explain quantum tunneling in two sentences."
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import dataclass
from typing import Any, AsyncIterator, Iterable

import httpx

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


DEFAULT_BASE_URL = "https://api.k2think.ai"
DEFAULT_MODEL = "MBZUAI-IFM/K2-Think-v2"


Message = dict[str, str]


@dataclass
class ChatResult:
    """Parsed result from a non-streaming chat call."""

    content: str
    raw: dict[str, Any]

    @property
    def usage(self) -> dict[str, Any]:
        return self.raw.get("usage", {}) or {}


class K2Client:
    """Async client for K2 Think V2 chat completions."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float = 120.0,
    ) -> None:
        self.api_key = api_key or os.getenv("K2_API_KEY", "")
        self.base_url = (base_url or os.getenv("K2_BASE_URL", DEFAULT_BASE_URL)).rstrip("/")
        self.model = model or os.getenv("K2_MODEL", DEFAULT_MODEL)
        self.timeout = timeout

        if not self.api_key:
            raise ValueError(
                "K2_API_KEY is not set. Add it to your environment or backend/.env."
            )

    @property
    def _endpoint(self) -> str:
        return f"{self.base_url}/v1/chat/completions"

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _build_payload(
        self,
        messages: Iterable[Message],
        *,
        stream: bool,
        temperature: float | None,
        max_tokens: int | None,
        extra: dict[str, Any] | None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": list(messages),
            "stream": stream,
        }
        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        if extra:
            payload.update(extra)
        return payload

    async def chat(
        self,
        messages: Iterable[Message],
        *,
        temperature: float | None = 0.2,
        max_tokens: int | None = None,
        extra: dict[str, Any] | None = None,
    ) -> ChatResult:
        """Non-streaming chat completion. Returns parsed text + raw JSON."""
        payload = self._build_payload(
            messages,
            stream=False,
            temperature=temperature,
            max_tokens=max_tokens,
            extra=extra,
        )

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(self._endpoint, headers=self._headers, json=payload)
            response.raise_for_status()
            data = response.json()

        content = _extract_content(data)
        return ChatResult(content=content, raw=data)

    async def chat_stream(
        self,
        messages: Iterable[Message],
        *,
        temperature: float | None = 0.2,
        max_tokens: int | None = None,
        extra: dict[str, Any] | None = None,
    ) -> AsyncIterator[str]:
        """Streaming chat completion. Yields incremental text chunks (SSE deltas)."""
        payload = self._build_payload(
            messages,
            stream=True,
            temperature=temperature,
            max_tokens=max_tokens,
            extra=extra,
        )

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream(
                "POST", self._endpoint, headers=self._headers, json=payload
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        data_str = line[len("data: ") :].strip()
                    elif line.startswith("data:"):
                        data_str = line[len("data:") :].strip()
                    else:
                        continue

                    if data_str == "[DONE]":
                        break

                    try:
                        chunk = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue

                    delta = _extract_delta(chunk)
                    if delta:
                        yield delta


def _extract_content(data: dict[str, Any]) -> str:
    """Pull assistant text out of a non-streaming completion response."""
    choices = data.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        # Some OpenAI-compatible APIs return content as a list of parts.
        return "".join(part.get("text", "") for part in content if isinstance(part, dict))
    return ""


def _extract_delta(chunk: dict[str, Any]) -> str:
    """Pull incremental assistant text out of a streaming SSE chunk."""
    choices = chunk.get("choices") or []
    if not choices:
        return ""
    delta = choices[0].get("delta") or {}
    content = delta.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(part.get("text", "") for part in content if isinstance(part, dict))
    return ""


async def _cli(prompt: str, *, stream: bool) -> None:
    client = K2Client()
    messages: list[Message] = [{"role": "user", "content": prompt}]

    if stream:
        async for chunk in client.chat_stream(messages):
            sys.stdout.write(chunk)
            sys.stdout.flush()
        sys.stdout.write("\n")
    else:
        result = await client.chat(messages)
        print(result.content)
        if result.usage:
            print(f"\n[usage] {result.usage}", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description="Quick K2 Think V2 smoke test.")
    parser.add_argument("prompt", nargs="+", help="User prompt to send to K2.")
    parser.add_argument("--stream", action="store_true", help="Stream the response.")
    args = parser.parse_args()

    prompt = " ".join(args.prompt)
    try:
        asyncio.run(_cli(prompt, stream=args.stream))
    except httpx.HTTPStatusError as exc:
        print(
            f"HTTP {exc.response.status_code} from K2: {exc.response.text}",
            file=sys.stderr,
        )
        sys.exit(1)
    except ValueError as exc:
        print(f"Config error: {exc}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
