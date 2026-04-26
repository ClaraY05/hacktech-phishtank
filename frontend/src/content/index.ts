import { discoverLinks, buildLinkPayload } from "./helper/linkScanner";
import { collectDomSignals, sanitizeHtmlForAnalysis } from "./helper/sanitizer";
import {
  getBubbleState,
  highlightLinks,
  initializeFeatureActivationState,
  showBadge,
} from "./helper/styling";
import { setPageContext, getAnalyzedResults } from "./helper/hoverAnalyzer";

type DomSignals = ReturnType<typeof collectDomSignals>;

let cachedDomSignals: DomSignals | null = null;
let cachedTotalLinks = 0;
let inlinePopupPanel: HTMLDivElement | null = null;

const INLINE_POPUP_PANEL_ID = "ai-safe-link-inline-popup";
const PANEL_MIN_WIDTH = 320;
const PANEL_MIN_HEIGHT = 360;
const PANEL_HANDLE_SIZE = 14;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function closeInlinePopup(): void {
  inlinePopupPanel?.remove();
  inlinePopupPanel = null;
}

function pinPanelToCurrentRect(panel: HTMLElement): DOMRect {
  const rect = panel.getBoundingClientRect();
  panel.style.left = `${rect.left}px`;
  panel.style.top = `${rect.top}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
  return rect;
}

function makePanelDraggable(panel: HTMLDivElement, handle: HTMLDivElement): void {
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();

    const rect = pinPanelToCurrentRect(panel);
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;

    handle.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent: PointerEvent): void => {
      const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
      const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
      panel.style.left = `${clamp(startLeft + moveEvent.clientX - startX, 8, maxLeft)}px`;
      panel.style.top = `${clamp(startTop + moveEvent.clientY - startY, 8, maxTop)}px`;
    };

    const onPointerUp = (): void => {
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("pointercancel", onPointerUp);
    };

    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerUp);
  });
}

type ResizeCorner = "nw" | "ne" | "sw" | "se";

function makePanelResizable(panel: HTMLDivElement, handle: HTMLDivElement, corner: ResizeCorner): void {
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();

    const rect = pinPanelToCurrentRect(panel);
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = rect.width;
    const startHeight = rect.height;
    const startRight = rect.right;
    const startBottom = rect.bottom;

    handle.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent: PointerEvent): void => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      let nextLeft = rect.left;
      let nextTop = rect.top;
      let nextWidth = startWidth;
      let nextHeight = startHeight;

      if (corner.includes("e")) {
        nextWidth = clamp(startWidth + dx, PANEL_MIN_WIDTH, window.innerWidth - rect.left - 8);
      } else {
        nextWidth = clamp(startWidth - dx, PANEL_MIN_WIDTH, startRight - 8);
        nextLeft = startRight - nextWidth;
      }

      if (corner.includes("s")) {
        nextHeight = clamp(startHeight + dy, PANEL_MIN_HEIGHT, window.innerHeight - rect.top - 8);
      } else {
        nextHeight = clamp(startHeight - dy, PANEL_MIN_HEIGHT, startBottom - 8);
        nextTop = startBottom - nextHeight;
      }

      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
      panel.style.width = `${nextWidth}px`;
      panel.style.height = `${nextHeight}px`;
    };

    const onPointerUp = (): void => {
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("pointercancel", onPointerUp);
    };

    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerUp);
  });
}

function createPanelHandle(styles: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const handle = document.createElement("div");
  handle.style.position = "absolute";
  handle.style.zIndex = "2";
  handle.style.touchAction = "none";
  handle.style.userSelect = "none";
  handle.style.background = "transparent";
  Object.assign(handle.style, styles);
  return handle;
}

function toggleInlinePopup(): void {
  if (inlinePopupPanel) {
    closeInlinePopup();
    return;
  }

  const panel = document.createElement("div");
  panel.id = INLINE_POPUP_PANEL_ID;
  panel.style.position = "fixed";
  panel.style.top = "12px";
  panel.style.right = "12px";
  panel.style.width = "min(420px, calc(100vw - 24px))";
  panel.style.height = "min(560px, calc(100vh - 24px))";
  panel.style.minWidth = `${PANEL_MIN_WIDTH}px`;
  panel.style.minHeight = `${PANEL_MIN_HEIGHT}px`;
  panel.style.zIndex = "2147483647";
  panel.style.overflow = "hidden";
  panel.style.border = "1px solid rgba(17, 17, 16, 0.18)";
  panel.style.borderRadius = "12px";
  panel.style.boxShadow = "0 18px 48px rgba(17, 17, 16, 0.24)";
  panel.style.background = "#f7f7f5";

  const frame = document.createElement("iframe");
  frame.title = "PhishTank dashboard";
  frame.src = chrome.runtime.getURL("src/popup/popup.html");
  frame.style.width = "100%";
  frame.style.height = "100%";
  frame.style.border = "0";
  frame.style.background = "#f7f7f5";

  const topMoveHandle = createPanelHandle({
    top: "0",
    left: `${PANEL_HANDLE_SIZE}px`,
    right: `${PANEL_HANDLE_SIZE}px`,
    height: `${PANEL_HANDLE_SIZE}px`,
    cursor: "move",
  });
  const rightMoveHandle = createPanelHandle({
    top: `${PANEL_HANDLE_SIZE}px`,
    right: "0",
    bottom: `${PANEL_HANDLE_SIZE}px`,
    width: `${PANEL_HANDLE_SIZE}px`,
    cursor: "move",
  });
  const bottomMoveHandle = createPanelHandle({
    right: `${PANEL_HANDLE_SIZE}px`,
    bottom: "0",
    left: `${PANEL_HANDLE_SIZE}px`,
    height: `${PANEL_HANDLE_SIZE}px`,
    cursor: "move",
  });
  const leftMoveHandle = createPanelHandle({
    top: `${PANEL_HANDLE_SIZE}px`,
    bottom: `${PANEL_HANDLE_SIZE}px`,
    left: "0",
    width: `${PANEL_HANDLE_SIZE}px`,
    cursor: "move",
  });
  const topLeftResizeHandle = createPanelHandle({
    top: "0",
    left: "0",
    width: `${PANEL_HANDLE_SIZE}px`,
    height: `${PANEL_HANDLE_SIZE}px`,
    cursor: "nwse-resize",
  });
  const topRightResizeHandle = createPanelHandle({
    top: "0",
    right: "0",
    width: `${PANEL_HANDLE_SIZE}px`,
    height: `${PANEL_HANDLE_SIZE}px`,
    cursor: "nesw-resize",
  });
  const bottomLeftResizeHandle = createPanelHandle({
    bottom: "0",
    left: "0",
    width: `${PANEL_HANDLE_SIZE}px`,
    height: `${PANEL_HANDLE_SIZE}px`,
    cursor: "nesw-resize",
  });
  const bottomRightResizeHandle = createPanelHandle({
    right: "0",
    bottom: "0",
    width: `${PANEL_HANDLE_SIZE}px`,
    height: `${PANEL_HANDLE_SIZE}px`,
    cursor: "nwse-resize",
  });

  panel.append(
    frame,
    topMoveHandle,
    rightMoveHandle,
    bottomMoveHandle,
    leftMoveHandle,
    topLeftResizeHandle,
    topRightResizeHandle,
    bottomLeftResizeHandle,
    bottomRightResizeHandle,
  );
  document.documentElement.append(panel);
  inlinePopupPanel = panel;

  [topMoveHandle, rightMoveHandle, bottomMoveHandle, leftMoveHandle].forEach((handle) => {
    makePanelDraggable(panel, handle);
  });
  makePanelResizable(panel, topLeftResizeHandle, "nw");
  makePanelResizable(panel, topRightResizeHandle, "ne");
  makePanelResizable(panel, bottomLeftResizeHandle, "sw");
  makePanelResizable(panel, bottomRightResizeHandle, "se");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_PAGE_SUMMARY") {
    sendResponse({
      ok: true,
      domSignals: cachedDomSignals,
      totalLinks: cachedTotalLinks,
      pageUrl: window.location.href,
      analyzedResults: getAnalyzedResults(),
    });
    return;
  }

  if (message?.type === "TOGGLE_INLINE_POPUP") {
    toggleInlinePopup();
    sendResponse({ ok: true });
  }
});

const MAX_HTML_CHARS = 200_000;
const MAX_LINKS = 500;
const FALLBACK_TOOLTIP_TEXT = "PhishTank: no analysis details available yet.";
const ANALYZING_TOOLTIP_TEXT = "analysis in progress";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractTooltipText(entry: unknown): string | undefined {
  if (typeof entry === "string") {
    return entry;
  }

  if (!isRecord(entry)) {
    return undefined;
  }

  const textFields = [
    "tooltip",
    "description",
    "explanation",
    "reason",
    "summary",
    "risk_label",
    "verdict",
  ];

  for (const field of textFields) {
    const value = entry[field];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  const riskScore = entry.risk_score;
  if (typeof riskScore === "number") {
    const normalizedScore = Math.max(0, Math.min(100, Math.round(riskScore)));
    return `Risk score: ${normalizedScore}/100`;
  }

  return undefined;
}

function extractTooltipTextsFromResponse(data: unknown, expectedCount: number): string[] {
  const directList = Array.isArray(data) ? data : undefined;
  const wrappedList =
    isRecord(data) && Array.isArray(data.results)
      ? data.results
      : isRecord(data) && Array.isArray(data.links)
        ? data.links
        : isRecord(data) && Array.isArray(data.analyses)
          ? data.analyses
          : isRecord(data) && Array.isArray(data.items)
            ? data.items
            : undefined;

  const entries = directList ?? wrappedList;
  if (!entries) {
    return [];
  }

  return entries.slice(0, expectedCount).map((entry) => extractTooltipText(entry) || FALLBACK_TOOLTIP_TEXT);
}

async function runContentFlow(): Promise<void> {
  console.log("PhishTank content script injected", window.location.href);
  await initializeFeatureActivationState();

  const discoveredLinks = discoverLinks(document);
  await highlightLinks(discoveredLinks);

  const payloadLinks = buildLinkPayload(discoveredLinks, MAX_LINKS);
  showBadge(payloadLinks.length);

  if (getBubbleState() === "disabled") {
    return;
  }

  if (payloadLinks.length === 0) {
    return;
  }

  // Stash page context once; per-link requests fire on hover (see hoverAnalyzer).
  // The background SW also rate-limits all outbound requests to stay below
  // Gemini's 15 RPM free-tier ceiling (see background/helper/rateLimiter.ts).
  console.log(`PhishTank found ${payloadLinks.length} links on page`);
  const domSignals = collectDomSignals(document);
  cachedDomSignals = domSignals;
  cachedTotalLinks = payloadLinks.length;
  const sanitizedHtmlExcerpt = sanitizeHtmlForAnalysis(document, MAX_HTML_CHARS);
  setPageContext({
    pageUrl: window.location.href,
    domSignals,
    sanitizedHtmlExcerpt,
  });

  console.log(
    `PhishTank ready — ${payloadLinks.length} links found; analysis fires on hover`,
  );
}

void runContentFlow();
