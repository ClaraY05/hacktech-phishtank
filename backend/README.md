# Backend

Python backend scaffold for AI Safe Link Sandbox.

## Purpose

This service is intended to:

- Accept batched link analysis requests from the Chrome extension.
- Orchestrate sandbox execution and AI reasoning.
- Return a unified risk response per URL.

## Structure

- `src/main.py`: FastAPI app placeholder and health route.
- `src/k2_client.py`: K2 Think V2 async client (chat + streaming).
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
