# AI Safe Link Sandbox — Project Description

## 🌐 Overview
AI Safe Link Sandbox is a browser-integrated security system that allows users to preview and analyze potentially dangerous links before clicking them. The system combines a Chrome extension, a sandboxed browser execution environment, and an AI reasoning model to deliver real-time safety scores and explanations.

Instead of requiring users to open a link and risk exposure, the system simulates link behavior in a controlled environment and explains what would have happened if the user clicked it.

---

## ⚙️ System Architecture

The system is composed of four main layers:

### 1. Browser Layer (Chrome Extension)
- Runs directly in the user’s browser
- Detects all hyperlinks on visited pages
- Sends link data to backend for analysis
- Provides:
  - Hover-based risk indicators (🟢 🟡 🔴)
  - Clickable “Analyze safely” tooltips
  - A detailed logistics panel with analysis results

---

### 2. Backend Orchestration Layer
- Receives link data from Chrome extension
- Deduplicates and manages incoming requests
- Sends URLs to sandbox execution layer
- Forwards sandbox output to AI model
- Returns unified response to frontend

---

### 3. Sandbox Execution Layer (Playwright)
Powered by Playwright:
- Launches headless browser sessions
- Safely loads URLs in isolation
- Captures:
  - Final redirected URL
  - Redirect chain
  - Network requests
  - External domains contacted
  - Page DOM signals
  - Screenshot of rendered page

---

### 4. AI Reasoning Layer (K2 Think V2)
Model: https://www.k2think.ai/k2think

The AI model:
- Analyzes structured sandbox output
- Detects malicious patterns such as:
  - Phishing behavior
  - Suspicious redirects
  - Data exfiltration attempts
  - Fake login pages
- Produces:
  - Risk score (0–100)
  - Risk category (LOW / MEDIUM / HIGH)
  - Human-readable explanation

---

## 🧠 Optional ML Enhancement Layer (Gemma Models)

We optionally integrate Google’s Gemma models (Gemma 4 family) as a preprocessing intelligence layer:

- Process raw Playwright sandbox outputs
- Normalize and summarize noisy browser telemetry
- Extract high-signal security features
- Pass structured reasoning-ready input to K2 Think V2

This creates a two-stage AI pipeline:
1. Gemma → feature extraction + summarization
2. K2 Think V2 → final reasoning + risk scoring

This improves consistency and reduces noise in AI decision-making.

---

## 🔄 Data Flow

Browser (Chrome Extension)
→ sends link data
→ Backend API
→ Playwright Sandbox (execution + observation)
→ Optional Gemma preprocessing layer
→ K2 Think V2 (AI reasoning)
→ Risk analysis + explanation
→ Backend aggregation
→ Extension UI (hover + panel display)

---

## 🧪 Technologies Used

### Core Stack
- Chrome Extension (Manifest V3)
- Python FastAPI or Node.js backend
- Playwright (sandbox execution layer)
- K2 Think V2 AI model:
  https://www.k2think.ai/k2think

### Optional AI Pipeline Enhancement
- Google Gemma 4 models (preprocessing layer)

### Optional State / Memory Layer
- MLH Backboard:
  https://mlh.link/backboard?ajs_uid=019db661-796a-c3ac-8b12-8e4251584bbe&utm_campaign=New+EYNTK&utm_content=EYNTK+-+Pre-Event+Email+%28v3%29&utm_medium=Email&utm_source=Customer.io

---

## 🔐 Optional AI Authentication Layer (Auth0 AI Agents)

We are considering integrating:
https://www.mlh.com/partners/auth0-ai-agents?ajs_uid=019db661-796a-c3ac-8b12-8e4251584bbe&utm_campaign=New+EYNTK&utm_content=EYNTK+-+Pre-Event+Email+%28v3%29&utm_medium=Email&utm_source=Customer.io

---

## 🎯 Product Vision

This system acts as a proactive security layer for the web, allowing users to understand the risk of any link before interacting with it. By combining browser automation, multi-stage AI reasoning, and real-time UI feedback, it transforms passive browsing into an informed and safe experience.
