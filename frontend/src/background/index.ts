import { postAnalyzeLinks } from "./helper/apiClient";
import { streamBatchToCallback, type StreamPayload } from "./helper/streamProxy";

const ANALYZE_PORT_NAME = "ai-safe-link-analyze";

const POPUP_WINDOW_WIDTH = 420;
const POPUP_WINDOW_HEIGHT = 560;
let popupWindowId: number | null = null;

async function openOrFocusExtensionWindow(): Promise<void> {
  if (popupWindowId !== null) {
    try {
      const existing = await chrome.windows.get(popupWindowId);
      if (existing.id !== undefined) {
        await chrome.windows.update(existing.id, { focused: true });
        return;
      }
    } catch {
      popupWindowId = null;
    }
  }

  const popupUrl = chrome.runtime.getURL("src/popup/popup.html");
  const created = await chrome.windows.create({
    url: popupUrl,
    type: "popup",
    focused: true,
    width: POPUP_WINDOW_WIDTH,
    height: POPUP_WINDOW_HEIGHT,
  });

  popupWindowId = created.id ?? null;
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("AI Safe Link extension installed.");
});

chrome.action.onClicked.addListener(() => {
  void openOrFocusExtensionWindow();
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (popupWindowId === windowId) {
    popupWindowId = null;
  }
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

// Streaming bridge for the content script. Content script can't fetch
// 127.0.0.1 directly because Chrome's Local Network Access blocks
// page-origin -> loopback. The SW runs in chrome-extension:// origin
// which is exempt when manifest host_permissions lists the target.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== ANALYZE_PORT_NAME) return;

  const controller = new AbortController();
  let started = false;

  port.onDisconnect.addListener(() => {
    controller.abort();
  });

  port.onMessage.addListener((msg) => {
    if (msg?.type !== "START" || started) return;
    started = true;
    const payload = msg.payload as StreamPayload;

    streamBatchToCallback(
      payload,
      (data) => {
        try {
          port.postMessage({ type: "RESULT", data });
        } catch {
          // port already closed
          controller.abort();
        }
      },
      controller.signal,
    )
      .then(() => {
        try {
          port.postMessage({ type: "DONE" });
        } catch {
          // ignore — port may have been closed by the content script
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const text = error instanceof Error ? error.message : String(error);
        try {
          port.postMessage({ type: "ERROR", error: text });
        } catch {
          // ignore
        }
      })
      .finally(() => {
        try {
          port.disconnect();
        } catch {
          // already disconnected
        }
      });
  });
});
