# Backend

Python backend scaffold for AI Safe Link Sandbox.

## Purpose

This service is intended to:

- Accept batched link analysis requests from the Chrome extension.
- Orchestrate sandbox execution and AI reasoning.
- Return a unified risk response per URL.

## Structure

- `src/main.py`: FastAPI app with `/health` and `POST /analyze-link` routes.
- `src/k2_client.py`: K2 Think V2 async client (chat + streaming).
- `src/gemma_client.py`: Gemma vision async client (Google AI Studio).
- `src/sandbox.py`: Playwright headless-Chromium screenshot capture.
- `src/orchestrator.py`: Glue that runs the Gemma -> K2 pipeline and
  returns a unified risk response.
- `tests/`: backend test scaffold.
- `.env.example`: environment variable template for local setup.

## Setup

1. Create a virtual environment.
2. Install package with dev dependencies:
   - `pip install -e ".[dev]"`
3. Install the Chromium browser used by Playwright (one-time, ~170MB):
   - `playwright install chromium`
4. Copy `.env.example` to `.env` and fill in `K2_API_KEY` and `GEMINI_API_KEY`.

## Run (placeholder app)

```bash
uvicorn main:app --reload --app-dir src
```

## K2 Think V2 Client

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

`POST /analyze-link` already runs the full pipeline:

1. Playwright captures the URL (`src/sandbox.py`).
2. Gemma 4 scores the screenshot (`src/gemma_client.py`).
3. K2 V2 reasons over the URL + Gemma's findings (`src/k2_client.py`).
4. The orchestrator returns a unified `UnifiedRiskResponse`
   (`risk`, `score`, `explanation`, `key_signals`, `gemma_vision`).

Future work: deduplicating / batching URLs from the extension, and
adding richer Playwright signals (redirect chain, network requests,
external domains) to the `sandbox_signals` field that K2 already
consumes.

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
to a URL, and returns viewport PNG bytes. It is called directly from
`POST /analyze-link` so the caller never has to supply a screenshot.

Implementation notes:

- A single Playwright + Chromium instance is cached at module level
  (lazy on first request) so repeat captures do not pay the ~2s
  Chromium relaunch cost.
- Each capture uses a fresh `BrowserContext`, so cookies, localStorage,
  and service workers cannot leak between URLs.
- 10 second navigation timeout, 750ms post-load settle.
- The browser is closed cleanly via a FastAPI `lifespan` shutdown hook.

### One-time setup

After installing Python deps:

```bash
playwright install chromium
```

### Smoke test from the CLI

Verifies Playwright is installed correctly without involving Gemma / K2:

```bash
python src/sandbox.py https://example.com /tmp/out.png
# wrote 12345 bytes -> /tmp/out.png
```

### Use it from Python

```python
from sandbox import capture_screenshot, shutdown_browser

png = await capture_screenshot("https://example.com")
# ... do stuff ...
await shutdown_browser()  # only on app shutdown
```

## Orchestrator (Playwright -> Gemma -> K2)

`src/orchestrator.py` exposes `analyze_link(url, screenshot, ...)` which:

1. Calls `GemmaClient.score_screenshot` to get a vision-only score and signals.
2. Builds a K2 prompt that injects Gemma's findings (and any optional sandbox
   signals once richer Playwright capture lands).
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
