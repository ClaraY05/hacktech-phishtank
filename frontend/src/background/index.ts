chrome.runtime.onInstalled.addListener(() => {
  console.log("AI Safe Link extension installed.");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "ANALYZE_LINKS") {
    // Placeholder: call backend API endpoint here.
    sendResponse({ ok: true, data: [], note: "Backend call not yet wired." });
  }
});
