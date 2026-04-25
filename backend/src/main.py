from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl

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


@app.post("/analyze-links")
def analyze_links(payload: AnalyzeLinksRequest) -> dict:
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
