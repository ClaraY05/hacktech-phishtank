"""
Playwright screenshot capture for AI Safe Link.

Launches a headless Chromium, navigates to a URL, returns the viewport
screenshot as PNG bytes. Designed to be called from inside the FastAPI
backend (no separate process / HTTP layer).

A single Playwright + Chromium instance is cached at module level to
avoid the ~2s relaunch cost per request. Each capture uses a fresh
``BrowserContext`` so cookies / localStorage / service workers cannot
leak across URLs.

Run as a script to smoke-test that Playwright + Chromium are installed:

    python src/sandbox.py https://example.com /tmp/out.png
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from playwright.async_api import (
    Browser,
    Error as PlaywrightError,
    Playwright,
    TimeoutError as PlaywrightTimeoutError,
    async_playwright,
)


DEFAULT_TIMEOUT_MS = 10_000
DEFAULT_VIEWPORT: tuple[int, int] = (1280, 800)
DEFAULT_SETTLE_MS = 750


class CaptureError(Exception):
    """Raised when Playwright fails to capture a screenshot for a URL."""


_playwright: Playwright | None = None
_browser: Browser | None = None
_lock = asyncio.Lock()


async def _get_browser() -> Browser:
    """Return the cached Chromium browser, lazily launching it on first use."""
    global _playwright, _browser
    async with _lock:
        if _browser is not None and _browser.is_connected():
            return _browser
        if _playwright is None:
            _playwright = await async_playwright().start()
        _browser = await _playwright.chromium.launch(headless=True)
    return _browser


async def capture_screenshot(
    url: str,
    *,
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
    viewport: tuple[int, int] = DEFAULT_VIEWPORT,
    wait_until: str = "domcontentloaded",
    settle_ms: int = DEFAULT_SETTLE_MS,
) -> bytes:
    """Open ``url`` in a fresh BrowserContext and return viewport PNG bytes.

    Raises:
        CaptureError: if navigation times out, the page errors, or the
            screenshot itself fails.
    """
    browser = await _get_browser()
    width, height = viewport
    context = await browser.new_context(
        viewport={"width": width, "height": height},
        accept_downloads=False,
    )
    try:
        page = await context.new_page()
        try:
            await page.goto(url, timeout=timeout_ms, wait_until=wait_until)
        except PlaywrightTimeoutError as exc:
            raise CaptureError(
                f"Timed out loading {url} after {timeout_ms}ms"
            ) from exc
        except PlaywrightError as exc:
            raise CaptureError(f"Playwright failed to load {url}: {exc}") from exc

        if settle_ms > 0:
            await page.wait_for_timeout(settle_ms)

        try:
            return await page.screenshot(type="png", full_page=False)
        except PlaywrightError as exc:
            raise CaptureError(f"Screenshot failed for {url}: {exc}") from exc
    finally:
        await context.close()


async def shutdown_browser() -> None:
    """Close the cached browser + Playwright. Safe to call multiple times."""
    global _playwright, _browser
    async with _lock:
        if _browser is not None:
            try:
                await _browser.close()
            except PlaywrightError:
                pass
            _browser = None
        if _playwright is not None:
            try:
                await _playwright.stop()
            except Exception:
                pass
            _playwright = None


async def _cli(url: str, out: Path) -> None:
    try:
        png = await capture_screenshot(url)
    finally:
        await shutdown_browser()
    out.write_bytes(png)
    print(f"wrote {len(png)} bytes -> {out}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Quick Playwright capture smoke test."
    )
    parser.add_argument("url", help="URL to capture.")
    parser.add_argument(
        "out",
        type=Path,
        nargs="?",
        default=Path("/tmp/sandbox-shot.png"),
        help="Output PNG path (default: /tmp/sandbox-shot.png).",
    )
    args = parser.parse_args()

    try:
        asyncio.run(_cli(args.url, args.out))
    except CaptureError as exc:
        print(f"capture error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
