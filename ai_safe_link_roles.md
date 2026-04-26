PhishTank Sandbox — Role Definitions (Updated)

1. Browser Extension Engineer (Frontend + UX Layer)

Goal:
Build the in-browser system that captures links, sends them to backend, and displays real-time safety feedback.

Responsibilities:
- Scan all <a> elements on page load
- Track dynamic DOM changes
- Extract URL, anchor text, context
- Send link data to backend API
- Batch + deduplicate requests
- Hover tooltip with risk indicator (🟢🟡🔴)
- Loading state ("Analyzing...")
- Click to open logistics panel

Logistics Panel:
- Screenshot preview
- Risk score
- AI explanation
- Redirect chain
- Metadata (requests, domains)

Output:
- Chrome extension (Manifest V3)
- Content scripts + UI overlays

Success:
- Fast hover response
- Works across websites
- Clean UI interaction

---

2. Backend Orchestrator Engineer (System Brain)

Goal:
Coordinate extension → sandbox → AI → response.

Responsibilities:
- Build API: POST /analyze-links
- Accept batch link data
- Deduplicate + cache URLs
- Send URLs to sandbox
- Send sandbox output to AI model (K2 V2)
- Aggregate results per page
- Return unified response

Response format:
{
  "url": "...",
  "risk": "HIGH",
  "score": 87,
  "explanation": "...",
  "redirect_chain": [...]
}

Output:
- API server (FastAPI / Express)
- Orchestration logic
- Caching layer

Success:
- Handles multiple links efficiently
- Low latency (<10–15s)

---

3. Sandbox Execution Engineer (Link Behavior Engine)

Goal:
Execute URLs safely and extract behavior signals.

Technology:
Playwright browser automation

Responsibilities:
- Launch headless browser per URL
- Navigate safely
- Capture:
  - Final URL
  - Redirect chain
  - Network requests
  - External domains
  - Screenshot
- Timeout + error handling
- Disable downloads / persistence

Output:
{
  "final_url": "...",
  "redirect_chain": [...],
  "num_requests": 32,
  "external_domains": [...],
  "screenshot": "..."
}

Success:
- Reliable execution
- Clean structured output
- No crashes on bad URLs

---

4. AI Reasoning Engineer (K2 V2 Layer)

Goal:
Convert sandbox signals into human-readable risk analysis.

Responsibilities:
- Design prompts for K2 Think V2
- Normalize sandbox data
- Generate:
  - Risk level (LOW/MEDIUM/HIGH)
  - Score (0–100)
  - Explanation (concise, human-readable)
- Detect phishing patterns, redirects, impersonation

Output:
{
  "risk": "HIGH",
  "score": 92,
  "explanation": "...",
  "key_signals": [...]
}

Success:
- Consistent reasoning
- Clear explanations
- No hallucinated behavior

---

System Flow:

Extension → Backend → Playwright Sandbox → K2 V2 AI → Backend → Extension UI

---

This system creates a real-time AI security layer for the web that previews links before users click them.
