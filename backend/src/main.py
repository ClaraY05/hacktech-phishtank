import logging

from fastapi import FastAPI
import subprocess
import json
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Safe Link Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LinkInput(BaseModel):
    url: HttpUrl
    text: str


class AnalyzeLinksRequest(BaseModel):
    page_url: HttpUrl
    links: list[LinkInput]
    dom_signals: dict | None = None
    sanitized_html_excerpt: str | None = None
    content_hash_hint: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class ScanRequest(BaseModel):
    url: str
    
@app.post("/scan")
async def scan_url(request: ScanRequest):
    try:
        # Here is where we call the Podman container
        cmd = [
            "docker", "run", "--rm", 
            "--runtime=runsc", # Add this back once gVisor is fully tested
            "safe-link-worker", 
            request.url
        ]
        
        # Run the container and capture the output
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        
        # Parse the JSON printed by your sandbox.py
        worker_output = json.loads(result.stdout)
        return worker_output
        
    except subprocess.CalledProcessError as e:
        return {"status": "error", "message": "Container crashed", "details": e.stderr}
@app.post("/analyze-links")
def analyze_links(payload: AnalyzeLinksRequest) -> dict:
    # logger.info("Received page_url=%s  link_count=%d", payload.page_url, len(payload.links))
    # logger.info("  dom_signals=%s  html_chars=%d  content_hash_hint=%s",
    #             payload.dom_signals, len(payload.sanitized_html_excerpt or ""), payload.content_hash_hint)
    # for link in payload.links:
    #     logger.info("  url=%s  text=%r", link.url, link.text)

    unique_urls = list(dict.fromkeys(str(link.url) for link in payload.links))
    dom_signals = payload.dom_signals or {}
    html_excerpt = payload.sanitized_html_excerpt or ""

    results = [
        {
            "url": url,
            "risk": "UNKNOWN",
            "score": 0,
            "explanation": "Scaffold response. K2 reasoning not wired yet.",
            "redirect_chain": [url],
        }
        for url in unique_urls
    ]

    return {
        "ok": True,
        "page_url": str(payload.page_url),
        "total_links": len(payload.links),
        "unique_links": len(unique_urls),
        "received_dom_signals": dom_signals,
        "received_html_chars": len(html_excerpt),
        "received_content_hash_hint": payload.content_hash_hint,
        "results": results,
    }
