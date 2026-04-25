import sys
import json
import base64
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

def analyze_url(url: str):
    # This is the dictionary we will eventually convert to JSON and send back
    report = {
        "url": url,
        "status": "pending",
        "title": None,
        "dom_length": 0,
        "screenshot_base64": None,
        "error": None
    }

    try:
        # Start the Playwright engine
        with sync_playwright() as p:
            # Launch Chromium headlessly (invisible background browser)
            browser = p.chromium.launch(headless=True)
            
            # Create a fresh, isolated browser context (like an incognito window)
            context = browser.new_context()
            page = context.new_page()

            # Navigate to the suspicious URL. 
            # wait_until="networkidle" means it waits for the page to finish loading its resources.
            # timeout=15000 means if the site takes longer than 15 seconds, we pull the plug.
            page.goto(url, timeout=15000, wait_until="networkidle")

            # --- GATHER THREAT INTELLIGENCE ---
            
            # 1. Grab the page title
            report["title"] = page.title()
            
            # 2. Get the full HTML source code length (useful for detecting empty/hidden pages)
            html_content = page.content()
            report["dom_length"] = len(html_content)
            
            # 3. Take a screenshot (Compress to JPEG so the JSON doesn't get too massive)
            screenshot_bytes = page.screenshot(type="jpeg", quality=50)
            report["screenshot_base64"] = base64.b64encode(screenshot_bytes).decode('utf-8')

            report["status"] = "success"

            # Close the browser cleanly
            browser.close()

    except PlaywrightTimeoutError:
        report["status"] = "error"
        report["error"] = "The website took too long to load or intentionally stalled."
    except Exception as e:
        report["status"] = "error"
        report["error"] = str(e)

    # PRINT the final JSON payload. 
    # Because FastAPI is listening to standard output (stdout), this 'print' 
    # sends the data directly back to main.py!
    print(json.dumps(report))


if __name__ == "__main__":
    # Ensure FastAPI actually passed a URL when it started the container
    if len(sys.argv) < 2:
        error_report = {"status": "error", "error": "No URL provided to worker"}
        print(json.dumps(error_report))
        sys.exit(1)
        
    # sys.argv[1] is the URL passed by the podman run command
    target_url = sys.argv[1]
    analyze_url(target_url)