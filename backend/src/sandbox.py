"""
Playwright sandbox capture for AI Safe Link.

Loads a URL in a headless Chromium and returns a structured ``SandboxResult``:
the rendered screenshot (base64 PNG), redirect chain, page title, downloads
detected, popups (new tabs + JS dialogs), external domains contacted, a
curated list of network requests, and the page's external ``<a href>`` link
targets enriched with cheap URL-string suspicion scores (no extra browsing).

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

# Caps for link enumeration. We only score external links (different host
# than the origin URL); internal navigation is ignored as noise.
MAX_RAW_HREFS = 1_000
MAX_LINK_TARGETS = 50
MAX_SUSPICIOUS_LINKS = 10

_IMPORTANT_RESOURCE_TYPES = {"document", "script", "xhr", "fetch", "websocket"}

# Heuristic word/host lists for cheap URL-string suspicion scoring.
# These are deliberately small and conservative; misses are fine since
# K2 sees the full link list and the visual evidence too.
_SUSPICIOUS_TLDS = frozenset({
    "tk", "ml", "ga", "cf", "gq",
    "top", "xyz", "click", "download", "zip", "loan", "men",
    "review", "country", "stream", "gdn", "racing", "win",
    "trade", "date", "party", "science", "work", "rest", "fit",
})

_URL_SHORTENERS = frozenset({
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly",
    "buff.ly", "is.gd", "rebrand.ly", "cutt.ly", "rb.gy",
    "shorturl.at", "tiny.cc", "lnkd.in", "tr.im", "v.gd",
})

_PHISH_KEYWORDS = frozenset({
    "login", "signin", "verify", "verification", "secure",
    "account", "update", "confirm", "wallet", "auth",
    "bank", "password", "billing", "invoice", "unlock",
    "suspended", "support",
})

_BRAND_KEYWORDS = frozenset({
    "paypal", "microsoft", "google", "apple", "amazon",
    "netflix", "facebook", "instagram", "twitter", "linkedin",
    "github", "dropbox", "office365", "outlook", "icloud",
    "chase", "wellsfargo", "bankofamerica", "coinbase",
    "binance", "metamask",
})


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


class LinkInfo(TypedDict):
    url: str
    host: str
    suspicion_score: int  # 0-100; cheap URL-string heuristics only
    reasons: list[str]


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
    link_count_total: int  # all unique http(s) <a href> URLs on the page
    link_count_external: int  # subset of the above with a different host
    link_targets: list[LinkInfo]  # external links, sorted by suspicion desc
    suspicious_links: list[LinkInfo]  # subset of link_targets with score > 0
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
    raw_hrefs: list[str] = []

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
            try:
                raw_hrefs = await page.eval_on_selector_all(
                    "a[href]", "els => els.map(e => e.href)"
                )
                if not isinstance(raw_hrefs, list):
                    raw_hrefs = []
            except PlaywrightError:
                raw_hrefs = []

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

    (
        link_targets,
        suspicious_links,
        link_count_total,
        link_count_external,
    ) = _build_link_lists(raw_hrefs, origin_host)

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
        link_count_total=link_count_total,
        link_count_external=link_count_external,
        link_targets=link_targets,
        suspicious_links=suspicious_links,
        error=error,
    )


def _collect_redirect_chain(response_urls: list[str]) -> list[str]:
    chain: list[str] = []
    for url in response_urls:
        if not chain or chain[-1] != url:
            chain.append(url)
    return chain


def _is_ip_literal(host: str) -> bool:
    """Cheap IPv4 literal check (strips port if present)."""
    bare = host.split(":")[0]
    parts = bare.split(".")
    if len(parts) != 4:
        return False
    try:
        return all(0 <= int(p) <= 255 for p in parts)
    except ValueError:
        return False


def _score_link_suspicion(url: str, host: str) -> tuple[int, list[str]]:
    """Heuristic 0-100 suspicion score plus a list of reason tags.

    Pure URL-string analysis: no DNS, no fetching. Designed to surface
    common phishing patterns (typosquats, IDN homoglyphs, suspicious
    TLDs, brand-in-subdomain, IP literals, URL shorteners, etc).
    """
    score = 0
    reasons: list[str] = []

    parsed = urlparse(url)
    host_lower = host.lower()
    netloc_lower = (parsed.netloc or "").lower()
    path_lower = (parsed.path or "").lower()

    if "@" in netloc_lower:
        score += 50
        reasons.append("userinfo_in_url")

    if host_lower and _is_ip_literal(host_lower):
        score += 40
        reasons.append("ip_literal_host")

    if host_lower.startswith("xn--") or ".xn--" in host_lower:
        score += 30
        reasons.append("punycode_host")

    if "." in host_lower:
        tld = host_lower.rsplit(".", 1)[-1]
        if tld in _SUSPICIOUS_TLDS:
            score += 25
            reasons.append(f"suspicious_tld:{tld}")

    if host_lower in _URL_SHORTENERS:
        score += 15
        reasons.append("url_shortener")

    url_len = len(url)
    if url_len > 200:
        score += 20
        reasons.append("very_long_url")
    elif url_len > 100:
        score += 10
        reasons.append("long_url")

    labels = [lbl for lbl in host_lower.split(".") if lbl]
    if len(labels) > 4:
        score += 20
        reasons.append("many_subdomains")

    if any(kw in host_lower for kw in _PHISH_KEYWORDS):
        score += 20
        reasons.append("phish_keyword_in_host")

    phish_in_path = sum(1 for kw in _PHISH_KEYWORDS if kw in path_lower)
    if phish_in_path:
        score += min(15, 5 * phish_in_path)
        reasons.append("phish_keyword_in_path")

    # Brand-in-subdomain: e.g. paypal.attacker.com — labels[:-2] is the
    # rough subdomain portion (good enough for .com/.org/.net; fuzzy on
    # multi-part TLDs like .co.uk, but acceptable for hackathon-grade
    # heuristics).
    if len(labels) >= 3:
        for label in labels[:-2]:
            if label in _BRAND_KEYWORDS:
                score += 50
                reasons.append(f"brand_in_subdomain:{label}")
                break

    if parsed.port and parsed.port not in (80, 443):
        score += 10
        reasons.append(f"non_standard_port:{parsed.port}")

    if url.count("%") > 5:
        score += 10
        reasons.append("heavy_url_encoding")

    return min(score, 100), reasons


def _build_link_lists(
    hrefs: list[str], origin_host: str
) -> tuple[list[LinkInfo], list[LinkInfo], int, int]:
    """Dedupe, filter, score, and rank ``<a href>`` targets.

    Returns ``(link_targets, suspicious_links, total_unique, external_unique)``.
    Internal navigation (same host as origin) is counted but dropped from
    the returned link lists since it's high-noise / low-signal for phishing.
    """
    seen: set[str] = set()
    external_links: list[LinkInfo] = []
    total_unique = 0
    origin_lower = origin_host.lower()

    for raw in hrefs[:MAX_RAW_HREFS]:
        if not isinstance(raw, str):
            continue
        if not raw.startswith(("http://", "https://")):
            continue
        if raw in seen:
            continue
        seen.add(raw)
        total_unique += 1

        host = (urlparse(raw).hostname or "").lower()
        if not host or host == origin_lower:
            continue

        score, reasons = _score_link_suspicion(raw, host)
        external_links.append(
            LinkInfo(
                url=raw,
                host=host,
                suspicion_score=score,
                reasons=reasons,
            )
        )

    external_links.sort(key=lambda li: (-li["suspicion_score"], li["url"]))
    targets = external_links[:MAX_LINK_TARGETS]
    suspicious = [li for li in external_links if li["suspicion_score"] > 0][
        :MAX_SUSPICIOUS_LINKS
    ]
    return targets, suspicious, total_unique, len(external_links)


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
