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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze-links")
def analyze_links(payload: AnalyzeLinksRequest) -> dict:
    unique_urls = list(dict.fromkeys(str(link.url) for link in payload.links))

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
        "results": results,
    }
