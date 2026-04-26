// Streams analysis results from the backend through the extension's
// background service worker. We can't fetch 127.0.0.1 directly from the
// content script because Chrome's Local Network Access (LNA) policy
// blocks page-origin -> loopback requests, even with CORS headers.
// The SW runs in chrome-extension:// origin and is exempt when
// manifest host_permissions includes the target.

const ANALYZE_PORT_NAME = "ai-safe-link-analyze";

export type LinkAnalysisResult = {
  url: string;
  risk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  score: number;
  explanation: string;
  key_signals: string[];
  error?: string;
};

export function scoreToRating(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

type IncomingMessage =
  | { type: "RESULT"; data: LinkAnalysisResult }
  | { type: "DONE" }
  | { type: "ERROR"; error: string };

export function streamBatchAnalysis(
  payload: {
    pageUrl: string;
    links: { url: string; text: string }[];
    domSignals: object;
    sanitizedHtmlExcerpt: string;
    contentHashHint: string;
  },
  onResult: (result: LinkAnalysisResult) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: ANALYZE_PORT_NAME });
    let settled = false;

    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      try {
        port.disconnect();
      } catch {
        // already disconnected
      }
      if (err) reject(err);
      else resolve();
    };

    port.onMessage.addListener((msg: IncomingMessage) => {
      if (msg.type === "RESULT") {
        onResult(msg.data);
      } else if (msg.type === "DONE") {
        settle();
      } else if (msg.type === "ERROR") {
        settle(new Error(msg.error));
      }
    });

    port.onDisconnect.addListener(() => {
      const lastError = chrome.runtime.lastError?.message;
      settle(lastError ? new Error(lastError) : undefined);
    });

    try {
      port.postMessage({ type: "START", payload });
    } catch (err) {
      settle(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
