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
- `src/orchestrator.py`: Glue that runs the Gemma -> K2 pipeline and
  returns a unified risk response.
- `tests/`: backend test scaffold.
- `.env.example`: environment variable template for local setup.

## Setup

1. Create a virtual environment.
2. Install package with dev dependencies:
   - `pip install -e ".[dev]"`
3. Copy `.env.example` to `.env` and fill in `K2_API_KEY`.

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

### Intended future wiring

In the upcoming `POST /analyze-links` route:

1. Receive and deduplicate URLs from the extension.
2. Run Playwright sandbox extraction per URL.
3. Pass sandbox output (and Gemma-derived multimodal features) into a K2 prompt.
4. Transform K2 output into the unified response shape
   (`risk`, `score`, `explanation`, `redirect_chain`, `key_signals`).

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

## Orchestrator (Gemma -> K2)

`src/orchestrator.py` exposes `analyze_link(url, screenshot, ...)` which:

1. Calls `GemmaClient.score_screenshot` to get a vision-only score and signals.
2. Builds a K2 prompt that injects Gemma's findings (and any optional sandbox
   signals from Playwright once that lands).
3. Calls `K2Client.chat` and parses K2's JSON into a `UnifiedRiskResponse`
   (`url`, `risk`, `score`, `explanation`, `key_signals`, `gemma_vision`).

The Playwright sandbox layer is being built by another contributor; until
it lands, screenshots are passed in directly (bytes, base64 string, data URL,
or path on disk).

### Endpoint

`POST /analyze-link` exposes the orchestrator over HTTP:

```bash
curl -X POST http://localhost:8000/analyze-link \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg url 'https://example.com' \
        --arg img "$(base64 < screenshot.png)" \
        '{url:$url, screenshot_b64:$img}')"
```
