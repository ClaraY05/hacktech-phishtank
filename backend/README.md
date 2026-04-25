# Backend

Python backend scaffold for AI Safe Link Sandbox.

## Purpose

This service is intended to:

- Accept batched link analysis requests from the Chrome extension.
- Orchestrate sandbox execution and AI reasoning.
- Return a unified risk response per URL.

## Structure

- `src/main.py`: FastAPI app placeholder and health route.
- `src/k2_client_example.py`: K2 Think V2 API call template.
- `tests/`: backend test scaffold.
- `.env.example`: environment variable template for local setup.

## Setup

1. Create a virtual environment.
2. Install package with dev dependencies:
   - `pip install -e ".[dev]"`
3. Copy `.env.example` to `.env` and fill values.

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

The file `src/k2_client_example.py` includes a template for backend-side model calls using:

- environment-based credentials (`K2_API_KEY`)
- configurable base URL (`K2_BASE_URL`)
- configurable model ID (`K2_MODEL`)

It uses a chat-completions style payload so it can be adapted to the latest K2 endpoint and schema from:

- https://www.k2think.ai/k2think

### Intended Future Wiring

In your future `POST /analyze-links` route:

1. Receive and deduplicate URLs.
2. Run sandbox extraction per URL.
3. Pass sandbox output into `K2Client.analyze_signals(...)`.
4. Transform model output into your response shape (`risk`, `score`, `explanation`, `redirect_chain`).
