import type { AnalyzeLinksMessage } from "./payloadBuilder";

export function sendAnalyzeLinksMessage(payload: AnalyzeLinksMessage): void {
  chrome.runtime.sendMessage(payload, (response) => {
    if (chrome.runtime.lastError) {
      console.error("AI Safe Link message error:", chrome.runtime.lastError.message);
      return;
    }
    console.log("AI Safe Link backend response:", response);
  });
}
