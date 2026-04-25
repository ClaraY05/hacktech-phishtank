import { getBubbleState, setFeatureActivation, setStateChangeListener } from "./featureState";
import { hideTooltip } from "./tooltipController";
import { BADGE_ANALYZING_CLASS, BADGE_ID } from "./uiConstants";

const DISABLED_BADGE_TEXT = "AI Safe Link disabled (click to enable)";
const ACTIVE_BADGE_SUFFIX = " (click to disable)";
const ANALYZING_BADGE_TEXT_SHORT = "AI Safe Link: analyzing.";
const ANALYZING_BADGE_TEXT_LONG = "AI Safe Link: analyzing..";

let badgeElement: HTMLDivElement | null = null;
let currentBadgeLinkCount = 0;
let analyzingDotsIntervalId: number | null = null;
let showLongAnalyzingText = false;

function stopAnalyzingTextEffect(): void {
  if (analyzingDotsIntervalId === null) {
    return;
  }
  window.clearInterval(analyzingDotsIntervalId);
  analyzingDotsIntervalId = null;
}

function startAnalyzingTextEffect(): void {
  if (analyzingDotsIntervalId !== null) {
    return;
  }

  analyzingDotsIntervalId = window.setInterval(() => {
    if (getBubbleState() !== "analyzing") {
      stopAnalyzingTextEffect();
      return;
    }
    showLongAnalyzingText = !showLongAnalyzingText;
    updateBadgeText();
  }, 550);
}

function updateBadgeText(): void {
  if (!badgeElement) {
    return;
  }
  const bubbleState = getBubbleState();
  if (bubbleState === "analyzing") {
    badgeElement.textContent = showLongAnalyzingText ? ANALYZING_BADGE_TEXT_LONG : ANALYZING_BADGE_TEXT_SHORT;
    return;
  }
  badgeElement.textContent =
    bubbleState === "enabled"
      ? `AI Safe Link active: found ${currentBadgeLinkCount} links${ACTIVE_BADGE_SUFFIX}`
      : DISABLED_BADGE_TEXT;
}

function updateBadgeVisualState(): void {
  if (!badgeElement) {
    return;
  }
  const bubbleState = getBubbleState();
  if (bubbleState === "analyzing") {
    badgeElement.classList.add(BADGE_ANALYZING_CLASS);
    badgeElement.style.boxShadow = "";
    badgeElement.style.borderColor = "";
    return;
  }
  badgeElement.classList.remove(BADGE_ANALYZING_CLASS);
  badgeElement.style.borderColor = "transparent";
  badgeElement.style.boxShadow = "0 2px 6px rgba(0, 0, 0, 0.15), 0 10px 20px rgba(0, 0, 0, 0.2)";
}

function refreshBadgeState(): void {
  if (getBubbleState() === "analyzing") {
    startAnalyzingTextEffect();
  } else {
    stopAnalyzingTextEffect();
    showLongAnalyzingText = false;
  }
  updateBadgeText();
  updateBadgeVisualState();
}

function buildBadge(): HTMLDivElement {
  const badge = document.createElement("div");
  badge.id = BADGE_ID;
  badge.style.position = "fixed";
  badge.style.bottom = "12px";
  badge.style.right = "12px";
  badge.style.zIndex = "999999";
  badge.style.background = "linear-gradient(to right, rgba(17, 17, 17, 0.68), rgba(17, 17, 17, 0.5))";
  badge.style.color = "#fff";
  badge.style.fontFamily = "\"Plus Jakarta Sans\", system-ui, -apple-system, \"Segoe UI\", sans-serif";
  badge.style.fontSize = "12px";
  badge.style.lineHeight = "1.35";
  badge.style.padding = "8px 10px";
  badge.style.borderRadius = "8px";
  badge.style.border = "1px solid transparent";
  badge.style.boxShadow = "0 2px 6px rgba(0, 0, 0, 0.15), 0 10px 20px rgba(0, 0, 0, 0.2)";
  badge.style.transition = "border-color 0.2s ease, box-shadow 0.2s ease";
  badge.style.cursor = "pointer";
  badge.style.userSelect = "none";

  badge.addEventListener("mouseenter", () => {
    if (getBubbleState() === "analyzing") {
      return;
    }
    badge.style.borderColor = "rgba(255, 255, 255, 0.75)";
    badge.style.boxShadow = "0 0 0 1px rgba(255, 255, 255, 0.2), 0 2px 6px rgba(0, 0, 0, 0.15), 0 10px 20px rgba(0, 0, 0, 0.2)";
  });
  badge.addEventListener("mouseleave", () => {
    if (getBubbleState() === "analyzing") {
      return;
    }
    badge.style.borderColor = "transparent";
    badge.style.boxShadow = "0 2px 6px rgba(0, 0, 0, 0.15), 0 10px 20px rgba(0, 0, 0, 0.2)";
  });
  badge.addEventListener("click", () => {
    if (getBubbleState() === "analyzing") {
      return;
    }
    void setFeatureActivation(getBubbleState() !== "enabled");
    hideTooltip();
  });

  return badge;
}

export function initializeBadgeStateSync(): void {
  setStateChangeListener(() => {
    refreshBadgeState();
  });
}

export function showBadge(totalLinks: number): void {
  currentBadgeLinkCount = totalLinks;

  if (badgeElement?.isConnected) {
    refreshBadgeState();
    return;
  }

  const existing = document.getElementById(BADGE_ID);
  if (existing && existing instanceof HTMLDivElement) {
    badgeElement = existing;
    refreshBadgeState();
    return;
  }

  badgeElement = buildBadge();
  refreshBadgeState();
  document.body.appendChild(badgeElement);
}
