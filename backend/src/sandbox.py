from __future__ import annotations

import sys
import json
import asyncio
import base64
from urllib.parse import urlparse
from typing import TypedDict

from playwright.async_api import async_playwright, Download, Dialog, Page, Response, Request

NAVIGATION_TIMEOUT_MS = 15_000
POST_LOAD_SETTLE_MS = 1_500
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
    kind: str           # "new_tab" | "dialog"
    dialog_type: str | None
    child_result: SandboxResult | None


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


def _is_important_request(resource_type: str) -> bool:
    return resource_type in _IMPORTANT_RESOURCE_TYPES


def _collect_redirect_chain(response_urls: list[str]) -> list[str]:
    chain: list[str] = []
    for url in response_urls:
        if not chain or chain[-1] != url:
            chain.append(url)
    return chain


def _extract_external_domains(request_urls: list[str], origin_host: str) -> list[str]:
    external: set[str] = set()
    for url in request_urls:
        try:
            host = urlparse(url).netloc
            if host and host != origin_host:
                external.add(host)
        except Exception:
            pass
    return sorted(external)


async def _run_sandbox(url: str, depth: int) -> SandboxResult:
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

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(accept_downloads=True)

        def on_new_page(page: Page) -> None:
            new_tab_pages.append(page)

        async def on_download(download: Download) -> None:
            downloads.append(DownloadInfo(
                filename=download.suggested_filename,
                mime_type=None,
            ))
            await download.cancel()

        context.on("page", on_new_page)
        context.on("download", on_download)

        page = await context.new_page()

        def on_response(response: Response) -> None:
            response_urls.append(response.url)
            response_statuses[response.url] = response.status

        def on_request(request: Request) -> None:
            nonlocal num_requests_total
            num_requests_total += 1
            raw_requests.append((request.url, request.resource_type))

        async def on_dialog(dialog: Dialog) -> None:
            dialog_popups.append(PopupInfo(
                url=None,
                kind="dialog",
                dialog_type=dialog.type,
                child_result=None,
            ))
            await dialog.dismiss()

        page.on("response", on_response)
        page.on("request", on_request)
        page.on("dialog", on_dialog)

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=NAVIGATION_TIMEOUT_MS)
            await page.wait_for_timeout(POST_LOAD_SETTLE_MS)

            screenshot_bytes = await page.screenshot(full_page=False)
            screenshot_b64 = base64.b64encode(screenshot_bytes).decode()
            final_url = page.url
            page_title = await page.title()

        except Exception as e:
            error = str(e)

        finally:
            await context.close()
            await browser.close()

    network_requests: list[RequestInfo] = []
    for req_url, resource_type in raw_requests:
        if _is_important_request(resource_type) and len(network_requests) < MAX_STORED_REQUESTS:
            network_requests.append(RequestInfo(
                url=req_url,
                resource_type=resource_type,
                status=response_statuses.get(req_url),
            ))

    new_tab_popups: list[PopupInfo] = [
        PopupInfo(url=p.url, kind="new_tab", dialog_type=None, child_result=None)
        for p in new_tab_pages
        if p.url and p.url != "about:blank"
    ]

    if depth < MAX_POPUP_DEPTH:
        for i, popup in enumerate(new_tab_popups):
            if popup["url"]:
                child = await _run_sandbox(popup["url"], depth + 1)
                new_tab_popups[i] = PopupInfo(
                    url=popup["url"],
                    kind="new_tab",
                    dialog_type=None,
                    child_result=child,
                )

    return SandboxResult(
        url=url,
        final_url=final_url,
        redirect_chain=_collect_redirect_chain(response_urls),
        screenshot_b64=screenshot_b64,
        page_title=page_title,
        downloads_detected=downloads,
        popups_detected=dialog_popups + new_tab_popups,
        external_domains=_extract_external_domains([r[0] for r in raw_requests], origin_host),
        num_requests_total=num_requests_total,
        network_requests=network_requests,
        error=error,
    )


async def analyze_url(url: str) -> SandboxResult:
    return await _run_sandbox(url, depth=0)


async def analyze_batch(urls: list[str]) -> list[SandboxResult]:
    sem = asyncio.Semaphore(MAX_CONCURRENT_BROWSERS)

    async def bounded(url: str) -> SandboxResult:
        async with sem:
            return await analyze_url(url)

    return await asyncio.gather(*[bounded(url) for url in urls])

if __name__ == "__main__":
    # Ensure FastAPI actually passed a URL when it started the container
    if len(sys.argv) < 2:
        error_report = {"status": "error", "error": "No URL provided to worker"}
        print(json.dumps(error_report))
        sys.exit(1)
        
    # sys.argv[1] is the URL passed by the podman run command
    target_url = sys.argv[1]
    
    try:
        # Because analyze_url is an async function, we must use asyncio.run()
        result = asyncio.run(analyze_url(target_url))
        print(json.dumps(result))
    except Exception as e:
        error_report = {"status": "error", "error": str(e)}
        print(json.dumps(error_report))
        sys.exit(1)