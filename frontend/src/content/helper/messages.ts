import type { AnalyzeLinksMessage } from "./payloadBuilder";

export type AnalyzeLinksResponse = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

export function sendAnalyzeLinksMessage(payload: AnalyzeLinksMessage): Promise<AnalyzeLinksResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response: AnalyzeLinksResponse | undefined) => {
      if (chrome.runtime.lastError) {
        const errorMessage = chrome.runtime.lastError.message;
        console.error("PhishTank message error:", errorMessage);
        resolve({ ok: false, error: errorMessage });
        return;
      }

      if (!response) {
        resolve({ ok: false, error: "No response received from background script." });
        return;
      }

      resolve(response);
    });
  });
}
