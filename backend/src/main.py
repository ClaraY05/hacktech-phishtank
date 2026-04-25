from fastapi import FastAPI

app = FastAPI(title="AI Safe Link Backend")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
