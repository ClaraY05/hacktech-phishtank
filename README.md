# PhishTank Sandbox

This repository is split into two sections:

- `backend/`: Python backend scaffold (FastAPI-oriented) configured via `pyproject.toml`
- `frontend/`: Chrome Extension (Manifest V3) scaffold using TypeScript + Node.js

## Project Context

PhishTank Sandbox analyzes links before users click them. The extension discovers links and requests analysis from the backend. The backend is intended to orchestrate sandbox execution and AI reasoning (including K2 Think V2 integration).

## Repository Layout

- `backend/`
  - Python service scaffold
  - K2 API call example template
- `frontend/`
  - Chrome Extension scaffold (content/background/popup)

## Quick Start

### Backend

1. Create and activate a virtual environment.
2. Install dependencies from `backend/pyproject.toml`.
3. Copy `backend/.env.example` to `.env` and set credentials.

### Frontend

1. Install dependencies in `frontend/`.
2. Build TypeScript sources.
3. Load extension artifacts in Chrome Developer Mode.