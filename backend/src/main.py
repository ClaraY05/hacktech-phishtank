from fastapi import FastAPI
from pydantic import BaseModel
import subprocess
import json

app = FastAPI(title="AI Safe Link Backend")


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
            "podman", "run", "--rm", 
            # "--runtime=runsc", # Add this back once gVisor is fully tested
            "safe-link-worker", 
            request.url
        ]
        
        # Run the container and capture the output
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        
        # Parse the JSON printed by your worker.py
        worker_output = json.loads(result.stdout)
        return worker_output
        
    except subprocess.CalledProcessError as e:
        return {"status": "error", "message": "Container crashed", "details": e.stderr}
