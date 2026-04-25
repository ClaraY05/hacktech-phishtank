chrome.runtime.onInstalled.addListener(() => {
  console.log("AI Safe Link extension installed.");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "ANALYZE_LINKS") {
    fetch("http://127.0.0.1:8000/analyze-links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        page_url: message.pageUrl,
        links: message.links,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Backend HTTP ${response.status}: ${text}`);
        }
        return response.json();
      })
      .then((data) => {
        sendResponse({ ok: true, data });
      })
      .catch((error: unknown) => {
        const messageText = error instanceof Error ? error.message : String(error);
        sendResponse({ ok: false, error: messageText });
      });

    // Keep the response channel open for async fetch completion.
    return true;
  }
});
