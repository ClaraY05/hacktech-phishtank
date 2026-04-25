"""
Playwright sandbox capture for AI Safe Link.

Loads a URL in a headless Chromium and returns a structured ``SandboxResult``:
the rendered screenshot (base64 PNG), redirect chain, page title, downloads
detected, popups (new tabs + JS dialogs), external domains contacted, and a
curated list of network requests.

A single Playwright + Chromium instance is cached at module level so repeat
captures do not pay the ~2s relaunch cost. Each capture uses a fresh
``BrowserContext`` so cookies / localStorage / service workers cannot leak
between URLs. Concurrent captures are bounded by an ``asyncio.Semaphore``.

The richer ``capture()`` is the canonical entry point. ``capture_screenshot()``
is a back-compat helper that returns only the PNG bytes for callers that
already had a ``bytes`` interface.

Run as a script for a smoke test. The CLI deliberately matches the wire
format the future sandbox container will use: a single ``SandboxResult``
JSON object on stdout, status messages on stderr.

    python src/sandbox.py https://example.com
    python src/sandbox.py https://example.com --out /tmp/out.png
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import sys
from pathlib import Path
from typing import TypedDict
from urllib.parse import urlparse

from playwright.async_api import (
    Browser,
    Dialog,
    Download,
    Error as PlaywrightError,
    Page,
    Playwright,
    Request,
    Response,
    TimeoutError as PlaywrightTimeoutError,
    async_playwright,
)


DEFAULT_TIMEOUT_MS = 12_000
DEFAULT_VIEWPORT: tuple[int, int] = (1280, 800)
DEFAULT_SETTLE_MS = 1_000
MAX_STORED_REQUESTS = 150
MAX_POPUP_DEPTH = 1
MAX_CONCURRENT_BROWSERS = 5

_IMPORTANT_RESOURCE_TYPES = {"document", "script", "xhr", "fetch", "websocket"}


class RequestInfo(TypedDict):
    url: str
    resource_type: str
    status: int | None


class DownloadInfo(TypedDict):
    filename: str
    mime_type: str | None


class PopupInfo(TypedDict):
    url: str | None
    kind: str  # "new_tab" | "dialog"
    dialog_type: str | None
    child_result: "SandboxResult | None"


class SandboxResult(TypedDict):
    url: str
    final_url: str
    redirect_chain: list[str]
    screenshot_b64: str | None
    page_title: str
    downloads_detected: list[DownloadInfo]
    popups_detected: list[PopupInfo]
    external_domains: list[str]
    num_requests_total: int
    network_requests: list[RequestInfo]
    error: str | None


class CaptureError(Exception):
    """Raised when the sandbox cannot produce any usable screenshot for a URL."""


_playwright: Playwright | None = None
_browser: Browser | None = None
_browser_lock = asyncio.Lock()
_concurrency = asyncio.Semaphore(MAX_CONCURRENT_BROWSERS)


async def _get_browser() -> Browser:
    """Return the cached Chromium browser, lazily launching it on first use."""
    global _playwright, _browser
    async with _browser_lock:
        if _browser is not None and _browser.is_connected():
            return _browser
        if _playwright is None:
            _playwright = await async_playwright().start()
        _browser = await _playwright.chromium.launch(headless=True)
    return _browser


async def shutdown_browser() -> None:
    """Close the cached browser + Playwright. Safe to call multiple times."""
    global _playwright, _browser
    async with _browser_lock:
        if _browser is not None:
            try:
                await _browser.close()
            except PlaywrightError:
                pass
            _browser = None
        if _playwright is not None:
            try:
                await _playwright.stop()
            except Exception:  # noqa: BLE001
                pass
            _playwright = None


async def capture(
    url: str,
    *,
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
    viewport: tuple[int, int] = DEFAULT_VIEWPORT,
    settle_ms: int = DEFAULT_SETTLE_MS,
) -> SandboxResult:
    """Capture a full ``SandboxResult`` for ``url``.

    Concurrent calls are bounded by ``MAX_CONCURRENT_BROWSERS``. The semaphore
    is held only by top-level callers; popup recursion calls ``_capture_impl``
    directly to avoid self-deadlock.
    """
    async with _concurrency:
        return await _capture_impl(
            url,
            depth=0,
            timeout_ms=timeout_ms,
            viewport=viewport,
            settle_ms=settle_ms,
        )


async def capture_screenshot(
    url: str,
    *,
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
    viewport: tuple[int, int] = DEFAULT_VIEWPORT,
    settle_ms: int = DEFAULT_SETTLE_MS,
) -> bytes:
    """Back-compat helper: return only the PNG bytes from a capture()."""
    result = await capture(
        url, timeout_ms=timeout_ms, viewport=viewport, settle_ms=settle_ms
    )
    encoded = result.get("screenshot_b64")
    if not encoded:
        raise CaptureError(
            result.get("error") or f"sandbox produced no screenshot for {url}"
        )
    return base64.b64decode(encoded)


async def _capture_impl(
    url: str,
    *,
    depth: int,
    timeout_ms: int,
    viewport: tuple[int, int],
    settle_ms: int,
) -> SandboxResult:
    response_urls: list[str] = []
    response_statuses: dict[str, int] = {}
    raw_requests: list[tuple[str, str]] = []
    num_requests_total = 0
    downloads: list[DownloadInfo] = []
    dialog_popups: list[PopupInfo] = []
    new_tab_pages: list[Page] = []

    screenshot_b64: str | None = None
    final_url = url
    page_title = ""
    error: str | None = None

    origin_host = urlparse(url).netloc

    browser = await _get_browser()
    width, height = viewport
    context = await browser.new_context(
        viewport={"width": width, "height": height},
        accept_downloads=True,
    )

    def on_new_page(page: Page) -> None:
        new_tab_pages.append(page)

    async def on_download(download: Download) -> None:
        downloads.append(
            DownloadInfo(filename=download.suggested_filename, mime_type=None)
        )
        try:
            await download.cancel()
        except PlaywrightError:
            pass

    context.on("page", on_new_page)
    context.on("download", on_download)

    try:
        page = await context.new_page()

        def on_response(response: Response) -> None:
            response_urls.append(response.url)
            response_statuses[response.url] = response.status

        def on_request(request: Request) -> None:
            nonlocal num_requests_total
            num_requests_total += 1
            raw_requests.append((request.url, request.resource_type))

        async def on_dialog(dialog: Dialog) -> None:
            dialog_popups.append(
                PopupInfo(
                    url=None,
                    kind="dialog",
                    dialog_type=dialog.type,
                    child_result=None,
                )
            )
            try:
                await dialog.dismiss()
            except PlaywrightError:
                pass

        page.on("response", on_response)
        page.on("request", on_request)
        page.on("dialog", on_dialog)

        try:
            await page.goto(
                url, wait_until="domcontentloaded", timeout=timeout_ms
            )
            if settle_ms > 0:
                await page.wait_for_timeout(settle_ms)
            screenshot_bytes = await page.screenshot(type="png", full_page=False)
            screenshot_b64 = base64.b64encode(screenshot_bytes).decode()
            final_url = page.url
            try:
                page_title = await page.title()
            except PlaywrightError:
                page_title = ""

        except PlaywrightTimeoutError as exc:
            error = f"timeout after {timeout_ms}ms: {exc}"
        except PlaywrightError as exc:
            error = f"playwright error: {exc}"
        except Exception as exc:  # noqa: BLE001
            error = f"{type(exc).__name__}: {exc}"
    finally:
        try:
            await context.close()
        except PlaywrightError:
            pass

    network_requests: list[RequestInfo] = []
    for req_url, resource_type in raw_requests:
        if (
            resource_type in _IMPORTANT_RESOURCE_TYPES
            and len(network_requests) < MAX_STORED_REQUESTS
        ):
            network_requests.append(
                RequestInfo(
                    url=req_url,
                    resource_type=resource_type,
                    status=response_statuses.get(req_url),
                )
            )

    new_tab_popups: list[PopupInfo] = [
        PopupInfo(
            url=p.url,
            kind="new_tab",
            dialog_type=None,
            child_result=None,
        )
        for p in new_tab_pages
        if p.url and p.url != "about:blank"
    ]

    if depth < MAX_POPUP_DEPTH:
        for i, popup in enumerate(new_tab_popups):
            popup_url = popup["url"]
            if popup_url:
                child = await _capture_impl(
                    popup_url,
                    depth=depth + 1,
                    timeout_ms=timeout_ms,
                    viewport=viewport,
                    settle_ms=settle_ms,
                )
                new_tab_popups[i] = PopupInfo(
                    url=popup_url,
                    kind="new_tab",
                    dialog_type=None,
                    child_result=child,
                )

    external_domains = sorted(
        {
            host
            for req_url, _ in raw_requests
            if (host := urlparse(req_url).netloc) and host != origin_host
        }
    )

    return SandboxResult(
        url=url,
        final_url=final_url,
        redirect_chain=_collect_redirect_chain(response_urls),
        screenshot_b64=screenshot_b64,
        page_title=page_title,
        downloads_detected=downloads,
        popups_detected=dialog_popups + new_tab_popups,
        external_domains=external_domains,
        num_requests_total=num_requests_total,
        network_requests=network_requests,
        error=error,
    )


def _collect_redirect_chain(response_urls: list[str]) -> list[str]:
    chain: list[str] = []
    for url in response_urls:
        if not chain or chain[-1] != url:
            chain.append(url)
    return chain


async def _cli(url: str, out: Path | None) -> None:
    try:
        result = await capture(url)
    finally:
        await shutdown_browser()

    if out is not None and result.get("screenshot_b64"):
        out.write_bytes(base64.b64decode(result["screenshot_b64"]))
        print(f"wrote screenshot -> {out}", file=sys.stderr)

    json.dump(result, sys.stdout)
    sys.stdout.write("\n")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Capture a URL and emit a SandboxResult JSON on stdout. "
            "Matches the wire format used by the future container runtime."
        )
    )
    parser.add_argument("url", help="URL to capture.")
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Optional: also write the PNG screenshot to this path.",
    )
    args = parser.parse_args()

    try:
        asyncio.run(_cli(args.url, args.out))
    except CaptureError as exc:
        print(f"capture error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
