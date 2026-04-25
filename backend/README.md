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
4. Run ./setup.sh (`chmod +x ./setup` if needed)

## Run (placeholder app)
```bash
podman build -t safe-link-worker .
```

```bash
uvicorn main:app --reload --app-dir src
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
