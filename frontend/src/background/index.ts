import { postAnalyzeLinks } from "./helper/apiClient";
import type { BubbleState } from "../content/helper/uiConstants";

const POPUP_WINDOW_WIDTH = 420;
const POPUP_WINDOW_HEIGHT = 560;
let popupWindowId: number | null = null;
let latestUiState: BubbleState = "enabled";
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

async function setToolbarStateDot(state: BubbleState): Promise<void> {
  latestUiState = state;
  const color = TOOLBAR_STATE_COLORS[state];
  await chrome.action.setBadgeText({ text: "" });
  await chrome.action.setIcon({
    imageData: {
      16: buildDotIconImageData(16, color),
      32: buildDotIconImageData(32, color),
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

chrome.runtime.onInstalled.addListener(() => {
  console.log("PhishTank extension installed.");
  void setToolbarStateDot("enabled");
});

chrome.action.onClicked.addListener(() => {
  void openOrFocusExtensionWindow();
});

void setToolbarStateDot("enabled");

chrome.windows.onRemoved.addListener((windowId) => {
  if (popupWindowId === windowId) {
    popupWindowId = null;
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
