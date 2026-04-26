import { getBackendAnalysisStatus, postAnalyzeLinks } from "./helper/apiClient";
import { streamBatchToCallback, type StreamPayload } from "./helper/streamProxy";
import type { BubbleState } from "../content/helper/uiConstants";

const ANALYZE_PORT_NAME = "ai-safe-link-analyze";
const POPUP_PORT_NAME = "ai-safe-link-popup";

type LinkAnalysisResult = {
  url: string;
  risk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  score: number;
  explanation: string;
  key_signals: string[];
  error?: string;
};

type TabSlot = { pageUrl: string; results: Map<string, LinkAnalysisResult> };
const tabResults = new Map<number, TabSlot>();
const popupPorts = new Set<chrome.runtime.Port>();

function recordResult(tabId: number, pageUrl: string, data: unknown): void {
  if (typeof data !== "object" || data === null) return;
  const result = data as LinkAnalysisResult;
  if (typeof result.url !== "string") return;

  let slot = tabResults.get(tabId);
  if (!slot || slot.pageUrl !== pageUrl) {
    slot = { pageUrl, results: new Map() };
    tabResults.set(tabId, slot);
  }
  slot.results.set(result.url, result);

  for (const port of popupPorts) {
    try {
      port.postMessage({ type: "TAB_UPDATE", tabId, pageUrl, data: result });
    } catch {
      // popup closed mid-broadcast; cleaned up by onDisconnect
    }
  }
}

const POPUP_WINDOW_WIDTH = 420;
const POPUP_WINDOW_HEIGHT = 560;
const BASE_ICON_PATH = "src/fih_icons/fih_icon.png";
let popupWindowId: number | null = null;
let summaryTabId: number | null = null;
let latestUiState: BubbleState = "enabled";
const baseIconCache = new Map<number, ImageData>();
const TOOLBAR_STATE_COLORS: Record<BubbleState, string> = {
  analyzing: "#e8472f",
  enabled: "#0a8c7a",
  disabled: "#0a8c7a",
};

function buildDotIconImageData(size: number, color: string): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");
  if (!context) {
    return new ImageData(size, size);
  }

  context.clearRect(0, 0, size, size);
  const radius = size <= 16 ? 4 : 6;
  const centerX = size - radius - 1;
  const centerY = radius + 1;

  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();

  context.lineWidth = 1.5;
  context.strokeStyle = "rgba(255, 255, 255, 0.95)";
  context.stroke();

  return context.getImageData(0, 0, size, size);
}

async function getBaseIconImageData(size: number): Promise<ImageData | null> {
  const cached = baseIconCache.get(size);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(chrome.runtime.getURL(BASE_ICON_PATH));
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return null;
    }

    context.clearRect(0, 0, size, size);
    context.drawImage(bitmap, 0, 0, size, size);
    bitmap.close();

    const imageData = context.getImageData(0, 0, size, size);
    baseIconCache.set(size, imageData);
    return imageData;
  } catch (error) {
    console.warn("PhishTank: failed to load base action icon", error);
    return null;
  }
}

async function buildStatusIconImageData(size: number, color: string): Promise<ImageData> {
  const baseIcon = await getBaseIconImageData(size);
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");
  if (!context) {
    return buildDotIconImageData(size, color);
  }

  context.clearRect(0, 0, size, size);
  if (baseIcon) {
    context.putImageData(baseIcon, 0, 0);
  }

  const radius = size <= 16 ? 4 : 6;
  const centerX = size - radius - 1;
  const centerY = radius + 1;

  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();

  context.lineWidth = 1.5;
  context.strokeStyle = "rgba(255, 255, 255, 0.95)";
  context.stroke();
  return context.getImageData(0, 0, size, size);
}

async function setToolbarStateDot(state: BubbleState): Promise<void> {
  latestUiState = state;
  const color = TOOLBAR_STATE_COLORS[state];
  await chrome.action.setBadgeText({ text: "" });
  const [icon16, icon32] = await Promise.all([
    buildStatusIconImageData(16, color),
    buildStatusIconImageData(32, color),
  ]);
  await chrome.action.setIcon({
    imageData: {
      16: icon16,
      32: icon32,
    },
  });
}

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

async function resolveSummaryTabId(): Promise<number | null> {
  if (summaryTabId !== null) {
    try {
      await chrome.tabs.get(summaryTabId);
      return summaryTabId;
    } catch {
      summaryTabId = null;
    }
  }

  // Prefer the focused normal browser window (not the extension popup window).
  const windows = await chrome.windows.getAll({
    populate: true,
    windowTypes: ["normal"],
  });
  const focusedNormal = windows.find((win) => win.focused) ?? windows[0];
  const activeTab = focusedNormal?.tabs?.find((tab) => tab.active && tab.id !== undefined);

  if (activeTab?.id !== undefined) {
    summaryTabId = activeTab.id;
    return activeTab.id;
  }

  return null;
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("PhishTank extension installed.");
  void setToolbarStateDot("enabled");
});

chrome.action.onClicked.addListener((tab) => {
  summaryTabId = tab.id ?? summaryTabId;
  if (tab.id === undefined) {
    void openOrFocusExtensionWindow();
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_INLINE_POPUP" }, () => {
    if (!chrome.runtime.lastError) return;
    void openOrFocusExtensionWindow();
  });
});

void setToolbarStateDot("enabled");

chrome.windows.onRemoved.addListener((windowId) => {
  if (popupWindowId === windowId) {
    popupWindowId = null;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (summaryTabId === tabId) {
    summaryTabId = null;
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_UI_STATE") {
    sendResponse({ ok: true, state: latestUiState });
    return;
  }

  if (message?.type === "UI_STATE_CHANGE") {
    const nextState = message.state as BubbleState;
    if (nextState === "enabled" || nextState === "disabled" || nextState === "analyzing") {
      void setToolbarStateDot(nextState);
    }
    return;
  }

  if (message?.type === "GET_PAGE_SUMMARY") {
    const requestedTabId = typeof message.tabId === "number" ? message.tabId : null;
    void (requestedTabId === null ? resolveSummaryTabId() : Promise.resolve(requestedTabId))
      .then((tabId) => {
        if (tabId === null) {
          sendResponse({ ok: false, error: "No active browser tab" });
          return;
        }
        summaryTabId = tabId;
        chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_SUMMARY" }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse(response ?? { ok: false, error: "No response from content script" });
        });
      })
      .catch((error: unknown) => {
        const text = error instanceof Error ? error.message : String(error);
        sendResponse({ ok: false, error: text });
      });
    return true;
  }

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

  if (message?.type === "GET_BACKEND_ANALYSIS_STATUS") {
    getBackendAnalysisStatus()
      .then((status) => {
        sendResponse({ ok: true, isAnalyzing: status.isAnalyzing });
      })
      .catch(() => {
        sendResponse({ ok: true, isAnalyzing: false });
      });
    return true;
  }

  if (message?.type === "GET_TAB_RESULTS") {
    const tabId = typeof message.tabId === "number" ? message.tabId : undefined;
    if (tabId === undefined) {
      sendResponse({ ok: false, error: "missing tabId" });
      return;
    }
    const slot = tabResults.get(tabId);
    sendResponse({
      ok: true,
      pageUrl: slot?.pageUrl ?? null,
      results: slot ? Array.from(slot.results.values()) : [],
    });
    return;
  }
});

// Streaming bridge for the content script. Content script can't fetch
// 127.0.0.1 directly because Chrome's Local Network Access blocks
// page-origin -> loopback. The SW runs in chrome-extension:// origin
// which is exempt when manifest host_permissions lists the target.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === POPUP_PORT_NAME) {
    popupPorts.add(port);
    port.onDisconnect.addListener(() => popupPorts.delete(port));
    return;
  }

  if (port.name !== ANALYZE_PORT_NAME) return;

  const controller = new AbortController();
  let started = false;
  const senderTabId = port.sender?.tab?.id;

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
        if (senderTabId !== undefined) {
          recordResult(senderTabId, payload.pageUrl, data);
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
