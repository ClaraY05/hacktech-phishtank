# Backend

Python backend scaffold for AI Safe Link Sandbox.

## Purpose

This service is intended to:

- Accept batched link analysis requests from the Chrome extension.
- Orchestrate sandbox execution and AI reasoning.
- Return a unified risk response per URL.

## Structure

- `src/main.py`: FastAPI app with `/health`, `POST /analyze-link`,
  `GET /cache/stats`, `POST /cache/invalidate` routes.
- `src/k2_client.py`: K2 Think V2 async client (chat + streaming).
- `src/gemma_client.py`: Gemma vision async client (Google AI Studio).
- `src/sandbox.py`: Playwright headless-Chromium capture (screenshot +
  redirect chain, popups, downloads, network, external domains, link
  enumeration with URL-string suspicion scoring).
- `src/worker.py`: One-shot container entrypoint. Receives a URL on
  argv, calls `sandbox.capture()`, prints the `SandboxResult` JSON
  on stdout. Used as the `Dockerfile` `ENTRYPOINT`.
- `src/sandbox_backend.py`: Pluggable sandbox-backend layer
  (`InProcessBackend`, `DockerBackend`, factory chosen by
  `SANDBOX_BACKEND` env var).
- `src/cache.py`: TTL + single-flight cache for analyzed verdicts.
- `Dockerfile`: built on top of `mcr.microsoft.com/playwright/python:v1.58.0-noble`
  (Chromium pre-installed); image tag is `safe-link-worker`.
- `setup.sh`: host bootstrap for Docker + gVisor on Linux/WSL.
- `src/orchestrator.py`: Glue that runs the Gemma -> K2 pipeline and
  returns a unified risk response.
- `tests/`: backend test scaffold.
- `.env.example`: environment variable template for local setup.

## Sandbox backend (pluggable)

The `/analyze-link` route does not call Playwright directly. It calls
whatever ``SandboxBackend`` was selected at startup via the
``SANDBOX_BACKEND`` env var. The pipeline only depends on the backend
returning a ``SandboxResult`` dict; how that dict is produced is the
backend's problem.

| `SANDBOX_BACKEND` | What runs | Host isolation |
|---|---|---|
| `inprocess` (default) | `sandbox.capture()` in the FastAPI process | Chromium renderer sandbox + per-request `BrowserContext` only |
| `docker` | `docker run --rm [--runtime=runsc] safe-link-worker <url>` | Linux namespaces + cgroups + dropped caps + read-only rootfs + (with gVisor) syscall mediation |

Switching is one env var. Same wire format (`SandboxResult` JSON),
same orchestrator, same downstream Gemma -> K2. To add a different
isolation strategy later (long-running sandbox worker over HTTP,
remote sandbox service, etc.), implement the ``SandboxBackend`` protocol
in `src/sandbox_backend.py` and add it to ``get_backend()``.

### Building the Docker image

```bash
cd backend
docker build -t safe-link-worker .
docker run --rm safe-link-worker https://example.com   # smoke test
```

Once the container prints a `SandboxResult` JSON to stdout, flip
`SANDBOX_BACKEND=docker` in the host backend `.env` and restart
uvicorn. No code changes required.

### Docker backend tunables

Defaults are deliberately strict; override per env var as needed:

| Env var | Default | Purpose |
|---|---|---|
| `SANDBOX_IMAGE` | `safe-link-worker` | Container image tag |
| `USE_RUNSC` | `0` | Add `--runtime=runsc` (gVisor); flip to `1` after `setup.sh` registers runsc in `/etc/docker/daemon.json` |
| `SANDBOX_TIMEOUT_S` | `30` | Wall-clock cap per request |
| `DOCKER_PATH` | autodetect | Override docker binary location |
| `SANDBOX_NETWORK` | unset | Docker network name (use a restrictive bridge net to block LAN egress) |
| `SANDBOX_MEMORY` | `1g` | cgroup memory cap |
| `SANDBOX_CPUS` | `1.0` | cgroup CPU cap |
| `SANDBOX_PIDS_LIMIT` | `200` | Fork-bomb guard |
| `SANDBOX_TMPFS_SIZE` | `200m` | Writable scratch size |

## Verdict cache

Every browser-extension hover hits `/analyze-link`. To make that
affordable, results are cached by canonicalized URL with an in-process
TTL cache plus single-flight coalescing:

| Behavior | Effect |
|---|---|
| Cached hit | Returns instantly, response includes `"_cache": "hit"` |
| First request for a URL | Runs the full pipeline, response includes `"_cache": "miss"` |
| Concurrent requests for the same URL | Only one runs the pipeline; others await its future. All get `"_cache": "coalesced"` |
| `force_refresh: true` in the request body | Bypasses cache and re-runs |

URL canonicalization (in `cache.canonicalize_url`): lowercase scheme +
host, strip default ports and the URL fragment, keep path + query as-is.

Tunable via env:

- `ANALYSIS_CACHE_MAX` (default `10000`)
- `ANALYSIS_CACHE_TTL_S` (default `3600`)

Inspection / control:

```bash
curl http://localhost:8000/cache/stats
curl -X POST http://localhost:8000/cache/invalidate \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/"}'
```

For multi-worker uvicorn deployments, swap the in-process `TTLCache`
inside `cache.AnalysisCache` for a Redis-backed implementation; the
`AnalysisCache` interface stays the same.

## Setup

1. Create a virtual environment.
2. Install package with dev dependencies:
   - `pip install -e ".[dev]"`
3. Install the Chromium browser used by Playwright (one-time, ~170MB):
   - `playwright install chromium`
4. Copy `.env.example` to `.env` and fill in `K2_API_KEY` and `GEMINI_API_KEY`.
5. (Container host only, Linux/WSL) Install Docker + gVisor for the
   containerized sandbox: `chmod +x ./setup.sh && ./setup.sh`. On
   macOS use Docker Desktop directly; setup.sh is not needed there.
   Not needed at all for in-process Playwright dev.

## Run (placeholder app)

```bash
uvicorn main:app --reload --app-dir src
```

## Current Extension Payload

The extension now sends a hybrid payload to `POST /analyze-links`:

- `page_url`: current page URL
- `links`: discovered links (`url`, `text`)
- `dom_signals`: extracted security signals (forms, iframes, suspicious keywords)
- `sanitized_html_excerpt`: sanitized and truncated HTML snapshot
- `content_hash_hint`: lightweight dedupe hint

Example request:

```bash
curl -X POST "http://127.0.0.1:8000/analyze-links" \
  -H "Content-Type: application/json" \
  -d '{
    "page_url": "https://example.com",
    "links": [
      {"url": "https://example.com/login", "text": "Login"},
      {"url": "https://example.com/help", "text": "Help"}
    ],
    "dom_signals": {
      "has_password_form": true,
      "num_forms": 1,
      "num_iframes": 0,
      "num_external_scripts": 3,
      "suspicious_keywords": ["verify account"]
    },
    "sanitized_html_excerpt": "<html><body>...</body></html>",
    "content_hash_hint": "example.com:2:31"
  }'
```

## K2 Think V2 Example Integration

`src/k2_client.py` is an async wrapper around the official K2 Think V2 chat
completions endpoint:

- Endpoint: `https://api.k2think.ai/v1/chat/completions`
- Model: `MBZUAI-IFM/K2-Think-v2`
- Auth: bearer token in `K2_API_KEY`

Configurable via env vars (or `.env` if `python-dotenv` is installed):

- `K2_API_KEY` (required)
- `K2_BASE_URL` (default `https://api.k2think.ai`)
- `K2_MODEL` (default `MBZUAI-IFM/K2-Think-v2`)

### Smoke test from the CLI

After installing deps and setting `K2_API_KEY`:

```bash
# non-streaming
python src/k2_client.py "What is 17 * 23? Show your reasoning."

# streaming (tokens print as they arrive)
python src/k2_client.py --stream "Explain quantum tunneling in two sentences."
```

### Use it from Python

```python
from k2_client import K2Client

client = K2Client()
result = await client.chat([
    {"role": "user", "content": "hi there"},
])
print(result.content)
```

### Wiring (current)

`POST /analyze-link` runs the full pipeline:

1. Playwright captures the URL (`src/sandbox.py`) — returns a rich
   `SandboxResult` with the screenshot plus redirect chain, popups,
   downloads, network requests, and external domains.
2. Gemma 4 scores the screenshot (`src/gemma_client.py`).
3. K2 V2 reasons over the URL, Gemma's findings, and the trimmed
   sandbox signals (`src/k2_client.py`).
4. The orchestrator returns a unified `UnifiedRiskResponse`
   (`risk`, `score`, `explanation`, `key_signals`, `gemma_vision`).

Future work: moving Playwright into a per-request Docker + gVisor
container (`Dockerfile` and `setup.sh` already in place; flip
`SANDBOX_BACKEND=docker` and `DockerBackend` will spawn the container
per request instead of running Playwright in-process). The capture API
and the orchestrator stay the same when that lands.

## Gemma 4 Vision Client

`src/gemma_client.py` is an async wrapper around Google AI Studio's
generateContent endpoint targeting **Gemma 4** (the MLH "Best Use of
Gemma 4" prize model), used as the vision-preprocessing stage before K2:

- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Default model: `gemma-4-26b-a4b-it` (Mixture-of-Experts variant)
- Alt model: `gemma-4-31b-it` (dense "Effective" variant)
- Auth: `x-goog-api-key: $GEMINI_API_KEY`

Both Gemma 4 models accept multimodal input (text + image), which is what
makes the screenshot-scoring stage possible.

Configurable via env vars (or `.env` if `python-dotenv` is installed):

- `GEMINI_API_KEY` (required)
- `GEMMA_BASE_URL` (default `https://generativelanguage.googleapis.com`)
- `GEMMA_MODEL` (default `gemma-4-26b-a4b-it`)

### Smoke test from the CLI

After installing deps and setting `GEMINI_API_KEY`:

```bash
python src/gemma_client.py path/to/screenshot.png
python src/gemma_client.py path/to/screenshot.png --url https://example.com
```

The CLI prints the parsed `GemmaVisionScore` as JSON:

```json
{
  "score": 87,
  "summary": "Page mimics a Microsoft 365 login flow with a credential form.",
  "visual_signals": ["fake Microsoft login form", "brand impersonation"]
}
```

### Use it from Python

```python
from gemma_client import GemmaClient

gemma = GemmaClient()
vision = await gemma.score_screenshot("screenshot.png", url="https://example.com")
print(vision.score, vision.visual_signals)
```

## Playwright Capture

`src/sandbox.py` launches a headless Chromium via Playwright, navigates
to a URL, and returns a structured `SandboxResult`:

```python
class SandboxResult(TypedDict):
    url: str
    final_url: str
    redirect_chain: list[str]
    screenshot_b64: str | None
    page_title: str
    downloads_detected: list[DownloadInfo]
    popups_detected: list[PopupInfo]   # new tabs + JS dialogs
    external_domains: list[str]
    num_requests_total: int
    network_requests: list[RequestInfo]  # capped at 150, filtered
    link_count_total: int       # all unique http(s) <a href> on the page
    link_count_external: int    # subset with a different host than origin
    link_targets: list[LinkInfo]      # external links, ranked by suspicion
    suspicious_links: list[LinkInfo]  # subset of link_targets w/ score > 0
    error: str | None
```

`LinkInfo` carries cheap URL-string suspicion analysis (no extra browsing,
no DNS, no fetching):

```python
class LinkInfo(TypedDict):
    url: str
    host: str
    suspicion_score: int   # 0-100
    reasons: list[str]     # e.g. ["brand_in_subdomain:paypal", "suspicious_tld:tk"]
```

Heuristics fired include: IP-literal hosts, `user@host` URL-trick,
punycode / IDN homoglyphs, suspicious TLDs (`.tk`, `.xyz`, etc.),
known URL shorteners, very long URLs, many subdomains, phish keywords
in host or path, brand-in-subdomain (e.g. `paypal.attacker.com`),
non-default ports, heavy URL encoding. K2 sees the full
`suspicious_links` list and is told to weight it heavily — this catches
pages whose own screenshot looks innocent but whose external links
point to obvious phishing destinations.

`POST /analyze-link` calls it directly, so the caller never has to
supply a screenshot.

Implementation notes:

- A single Playwright + Chromium instance is cached at module level
  (lazy on first request) so repeat captures do not pay the ~2s
  Chromium relaunch cost.
- Each capture uses a fresh `BrowserContext`, so cookies, localStorage,
  and service workers cannot leak between URLs.
- 12 second navigation timeout, 1s post-load settle, 1280×800 viewport.
- Concurrent captures bounded by an `asyncio.Semaphore` (max 5).
- New tabs / popups are captured recursively at depth 1.
- JS `alert/confirm/prompt` dialogs are dismissed and recorded.
- Downloads are intercepted, recorded, and cancelled (no bytes hit disk).
- The browser is closed cleanly via a FastAPI `lifespan` shutdown hook.

### One-time setup

After installing Python deps:

```bash
playwright install chromium
```

### Smoke test from the CLI

Verifies Playwright is installed correctly without involving Gemma / K2.
The CLI deliberately matches the wire format the future container will
use: `SandboxResult` JSON on stdout, status messages on stderr.

```bash
python src/sandbox.py https://example.com
python src/sandbox.py https://example.com --out /tmp/out.png
```

### Use it from Python

```python
from sandbox import capture, capture_screenshot, shutdown_browser

# rich result (preferred)
result = await capture("https://example.com")
print(result["redirect_chain"], result["external_domains"])

# screenshot bytes only (back-compat)
png = await capture_screenshot("https://example.com")

await shutdown_browser()  # only on app shutdown
```

## Orchestrator (Playwright -> Gemma -> K2)

`src/orchestrator.py` exposes `analyze_link(url, screenshot, sandbox_signals=...)`
which:

1. Calls `GemmaClient.score_screenshot` to get a vision-only score and signals.
2. Builds a K2 prompt that injects Gemma's findings and a trimmed view of the
   sandbox signals (`network_requests` capped, `external_domains` summarized).
3. Calls `K2Client.chat` and parses K2's JSON into a `UnifiedRiskResponse`
   (`url`, `risk`, `score`, `explanation`, `key_signals`, `gemma_vision`).

### Endpoint

`POST /analyze-link` is the full pipeline: it captures the screenshot
itself via Playwright, then runs the orchestrator. Caller only sends
the URL:

```bash
curl -X POST http://localhost:8000/analyze-link \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com"}'
```

Example response:

```json
{
  "url": "https://example.com",
  "risk": "LOW",
  "score": 0,
  "explanation": "Plain example.com landing page with no risky elements.",
  "key_signals": [],
  "gemma_vision": {
    "score": 0,
    "summary": "Plain example.com landing page.",
    "visual_signals": []
  }
}
```
