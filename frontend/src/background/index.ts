import { postAnalyzeLinks } from "./helper/apiClient";

chrome.runtime.onInstalled.addListener(() => {
  console.log("AI Safe Link extension installed.");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "ANALYZE_LINKS") {
    postAnalyzeLinks(message)
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
