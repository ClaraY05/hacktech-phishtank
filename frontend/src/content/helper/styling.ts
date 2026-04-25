const STYLE_ID = "ai-safe-link-style";
const HIGHLIGHT_CLASS = "ai-safe-link-highlight";
const TOOLTIP_ATTR = "data-ai-safe-tooltip";
const TOOLTIP_ID = "ai-safe-link-tooltip";
const TOOLTIP_VISIBLE_CLASS = "is-visible";
const TOOLTIP_ANALYZING_CLASS = "is-analyzing";
const TOOLTIP_GAP_PX = 8;
const BADGE_ID = "ai-safe-link-badge";
const BADGE_ANALYZING_CLASS = "ai-safe-link-badge--analyzing";
const ACTIVATION_STORAGE_KEY = "aiSafeLinkIsActive";
const DISABLED_BADGE_TEXT = "AI Safe Link disabled (click to enable)";
const ACTIVE_BADGE_SUFFIX = " (click to disable)";
const ANALYZING_BADGE_TEXT_SHORT = "AI Safe Link: analyzing.";
const ANALYZING_BADGE_TEXT_LONG = "AI Safe Link: analyzing...";
type BubbleState = "enabled" | "disabled" | "analyzing";

// Local testing override for corner bubble state.
// Set to "enabled", "disabled", or "analyzing" when testing.
const LOCAL_BUBBLE_STATE_OVERRIDE: BubbleState | null = "analyzing";
const DEFAULT_LINK_HIGHLIGHT_CSS = `
.ai-safe-link-highlight {
  position: relative;
  outline: 2px solid transparent;
  outline-offset: 2px;
}

.ai-safe-link-highlight::before {
  content: "";
  position: absolute;
  inset: -2px;
  pointer-events: none;
  opacity: 0;
  background:
    linear-gradient(#f5b301, #f5b301) top left / 0% 2px no-repeat,
    linear-gradient(#f5b301, #f5b301) bottom left / 0% 2px no-repeat,
    linear-gradient(#f5b301, #f5b301) top left / 2px 0% no-repeat,
    linear-gradient(#f5b301, #f5b301) top right / 2px 0% no-repeat;
  transition: background-size 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease;
}

.ai-safe-link-highlight:hover,
.ai-safe-link-highlight:focus-visible {
  outline-color: #f5b301 !important;
}

.ai-safe-link-highlight:hover::before,
.ai-safe-link-highlight:focus-visible::before {
  opacity: 1;
  background-size: 100% 2px, 100% 2px, 2px 100%, 2px 100%;
}

.ai-safe-link-tooltip {
  position: fixed;
  left: 0;
  top: 0;
  max-width: min(320px, calc(100vw - 24px));
  min-width: 180px;
  padding: 8px 10px;
  border-radius: 6px;
  background: linear-gradient(to right, rgba(17, 17, 17, 0.68), rgba(17, 17, 17, 0.5));
  color: #fff;
  font-size: 16px;
  line-height: 1.35;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.3);
  pointer-events: none;
  z-index: 2147483647;
  white-space: normal;
  opacity: 0;
  transform: translateY(0);
  transition: opacity 0.12s ease;
}

.ai-safe-link-tooltip.is-visible {
  opacity: 1;
}

.ai-safe-link-tooltip.is-analyzing {
  text-align: center;
}

@keyframes aiSafeLinkBadgeAnalyzingRing {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.45), 0 2px 6px rgba(0, 0, 0, 0.15), 0 10px 20px rgba(0, 0, 0, 0.2);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(255, 255, 255, 0), 0 2px 6px rgba(0, 0, 0, 0.15), 0 10px 20px rgba(0, 0, 0, 0.2);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0), 0 2px 6px rgba(0, 0, 0, 0.15), 0 10px 20px rgba(0, 0, 0, 0.2);
  }
}

.ai-safe-link-badge--analyzing {
  width: 210px;
  box-sizing: border-box;
  text-align: center;
  border-color: rgba(255, 255, 255, 0.88) !important;
  animation: aiSafeLinkBadgeAnalyzingRing 1.4s ease-out infinite;
}
`;

let tooltipElement: HTMLDivElement | null = null;
let badgeElement: HTMLDivElement | null = null;
let dynamicBindingInitialized = false;
let linkMutationObserver: MutationObserver | null = null;
let storageSyncInitialized = false;
let isFeatureActive = true;
let activationStateInitialized = false;
let currentBadgeLinkCount = 0;
let bubbleState: BubbleState = "enabled";
let analyzingDotsIntervalId: number | null = null;
let showLongAnalyzingText = false;

function isLinkUiEnabled(): boolean {
  return bubbleState !== "disabled";
}

function getAllLinks(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
}

function updateBadgeText(): void {
  if (!badgeElement) {
    return;
  }

  if (bubbleState === "analyzing") {
    badgeElement.textContent = showLongAnalyzingText
      ? ANALYZING_BADGE_TEXT_LONG
      : ANALYZING_BADGE_TEXT_SHORT;
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
    if (bubbleState !== "analyzing") {
      stopAnalyzingTextEffect();
      return;
    }
    showLongAnalyzingText = !showLongAnalyzingText;
    updateBadgeText();
  }, 550);
}

function syncBadgeStatusFromActivation(): void {
  if (LOCAL_BUBBLE_STATE_OVERRIDE) {
    bubbleState = LOCAL_BUBBLE_STATE_OVERRIDE;
    isFeatureActive = bubbleState !== "disabled";
    return;
  }
  bubbleState = isFeatureActive ? "enabled" : "disabled";
}

function refreshBadgeState(): void {
  syncBadgeStatusFromActivation();
  if (bubbleState === "analyzing") {
    startAnalyzingTextEffect();
  } else {
    stopAnalyzingTextEffect();
    showLongAnalyzingText = false;
  }
  updateBadgeText();
  updateBadgeVisualState();
}

function applyFeatureStateToLink(link: HTMLAnchorElement): void {
  if (isLinkUiEnabled()) {
    link.classList.add(HIGHLIGHT_CLASS);
    return;
  }

  link.classList.remove(HIGHLIGHT_CLASS);
  link.removeAttribute("title");
}

function applyFeatureStateToAllLinks(): void {
  getAllLinks().forEach((link) => {
    applyFeatureStateToLink(link);
  });

  if (!isLinkUiEnabled()) {
    hideTooltip();
  }
}

function initializeStorageSync(): void {
  if (storageSyncInitialized) {
    return;
  }

  storageSyncInitialized = true;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[ACTIVATION_STORAGE_KEY]) {
      return;
    }

    const nextValue = changes[ACTIVATION_STORAGE_KEY].newValue;
    if (typeof nextValue !== "boolean") {
      return;
    }

    isFeatureActive = nextValue;
    applyFeatureStateToAllLinks();
    refreshBadgeState();
  });
}

export async function initializeFeatureActivationState(): Promise<boolean> {
  if (activationStateInitialized) {
    return isFeatureActive;
  }

  try {
    const result = await chrome.storage.local.get(ACTIVATION_STORAGE_KEY);
    if (typeof result[ACTIVATION_STORAGE_KEY] === "boolean") {
      isFeatureActive = result[ACTIVATION_STORAGE_KEY] as boolean;
    } else {
      await chrome.storage.local.set({ [ACTIVATION_STORAGE_KEY]: true });
      isFeatureActive = true;
    }
  } catch (error) {
    console.warn("AI Safe Link: failed to read activation state", error);
    isFeatureActive = true;
  }

  activationStateInitialized = true;
  initializeStorageSync();
  return isFeatureActive;
}

export function isFeatureActivationEnabled(): boolean {
  return isFeatureActive;
}

export function getBubbleState(): BubbleState {
  return bubbleState;
}

export function setBadgeAnalyzing(isAnalyzing: boolean): void {
  if (LOCAL_BUBBLE_STATE_OVERRIDE) {
    bubbleState = LOCAL_BUBBLE_STATE_OVERRIDE;
  } else {
    bubbleState = isAnalyzing ? "analyzing" : isFeatureActive ? "enabled" : "disabled";
  }

  if (bubbleState === "analyzing") {
    startAnalyzingTextEffect();
  } else {
    stopAnalyzingTextEffect();
    showLongAnalyzingText = false;
  }
  updateBadgeText();
  updateBadgeVisualState();
}

async function setFeatureActivation(nextValue: boolean): Promise<void> {
  isFeatureActive = nextValue;
  applyFeatureStateToAllLinks();
  refreshBadgeState();
  hideTooltip();

  try {
    await chrome.storage.local.set({ [ACTIVATION_STORAGE_KEY]: nextValue });
  } catch (error) {
    console.warn("AI Safe Link: failed to persist activation state", error);
  }
}

function ensureTooltipElement(): HTMLDivElement {
  if (tooltipElement?.isConnected) {
    return tooltipElement;
  }

  const existing = document.getElementById(TOOLTIP_ID);
  if (existing && existing instanceof HTMLDivElement) {
    tooltipElement = existing;
    return tooltipElement;
  }

  const element = document.createElement("div");
  element.id = TOOLTIP_ID;
  element.className = "ai-safe-link-tooltip";
  element.setAttribute("role", "tooltip");
  (document.body || document.documentElement).appendChild(element);
  tooltipElement = element;
  return element;
}

function placeTooltipForLink(link: HTMLAnchorElement, tooltip: HTMLDivElement): void {
  const rect = link.getBoundingClientRect();
  const tooltipWidth = tooltip.offsetWidth;
  const tooltipHeight = tooltip.offsetHeight;

  let left = rect.left + rect.width / 2 - tooltipWidth / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - tooltipWidth - 12));

  const canPlaceAbove = rect.top >= tooltipHeight + TOOLTIP_GAP_PX + 4;
  const top = canPlaceAbove
    ? rect.top - tooltipHeight - TOOLTIP_GAP_PX
    : rect.bottom + TOOLTIP_GAP_PX;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showTooltip(link: HTMLAnchorElement): void {
  if (!isLinkUiEnabled()) {
    return;
  }

  const text = link.getAttribute(TOOLTIP_ATTR);
  if (!text) {
    return;
  }

  const tooltip = ensureTooltipElement();
  tooltip.textContent = text;
  if (bubbleState === "analyzing") {
    tooltip.classList.add(TOOLTIP_ANALYZING_CLASS);
  } else {
    tooltip.classList.remove(TOOLTIP_ANALYZING_CLASS);
  }
  placeTooltipForLink(link, tooltip);
  tooltip.classList.add(TOOLTIP_VISIBLE_CLASS);
}

function hideTooltip(): void {
  if (!tooltipElement) {
    return;
  }
  tooltipElement.classList.remove(TOOLTIP_VISIBLE_CLASS);
}

function bindLinkInteractions(link: HTMLAnchorElement): void {
  applyFeatureStateToLink(link);
  if (link.dataset.aiSafeTooltipBound === "true") {
    return;
  }

  link.dataset.aiSafeTooltipBound = "true";
  link.addEventListener("mouseenter", () => {
    showTooltip(link);
  });
  link.addEventListener("mouseleave", () => {
    hideTooltip();
  });
  link.addEventListener("focus", () => {
    showTooltip(link);
  });
  link.addEventListener("blur", () => {
    hideTooltip();
  });
}

function bindLinksInSubtree(root: ParentNode): void {
  const anchors = root.querySelectorAll<HTMLAnchorElement>("a[href]");
  anchors.forEach((anchor) => {
    bindLinkInteractions(anchor);
  });
}

function initializeDynamicLinkBinding(): void {
  if (dynamicBindingInitialized) {
    return;
  }

  dynamicBindingInitialized = true;

  // Sites with sticky headers often replace nav links during scroll; bind links lazily on interaction.
  const bindFromTarget = (target: EventTarget | null): void => {
    if (!(target instanceof Element)) {
      return;
    }
    const anchor = target.closest("a[href]");
    if (anchor && anchor instanceof HTMLAnchorElement) {
      bindLinkInteractions(anchor);
    }
  };

  document.addEventListener("mouseover", (event) => {
    bindFromTarget(event.target);
  });

  document.addEventListener("focusin", (event) => {
    bindFromTarget(event.target);
  });

  // Some sites replace header/nav DOM while scrolling. Observe mutations so new links
  // are prepared before the next hover, keeping the animation consistent.
  linkMutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) {
          return;
        }

        if (node instanceof HTMLAnchorElement && node.hasAttribute("href")) {
          bindLinkInteractions(node);
          return;
        }

        bindLinksInSubtree(node);
      });
    }
  });

  linkMutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

async function loadHighlightCss(): Promise<string> {
  const cssUrl = chrome.runtime.getURL("src/content/helper/styles.css");

  try {
    const response = await fetch(cssUrl);
    if (!response.ok) {
      throw new Error(`Failed to load highlight CSS (status ${response.status})`);
    }
    return await response.text();
  } catch (error) {
    console.warn("AI Safe Link: using fallback highlight CSS", error);
    return DEFAULT_LINK_HIGHLIGHT_CSS;
  }
}

async function ensureStylesInjected(): Promise<void> {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const cssText = await loadHighlightCss();

  const styleEl = document.createElement("style");
  styleEl.id = STYLE_ID;
  styleEl.textContent = cssText;
  (document.head || document.documentElement).appendChild(styleEl);
}

export async function highlightLinks(links: HTMLAnchorElement[]): Promise<void> {
  await initializeFeatureActivationState();
  await ensureStylesInjected();
  ensureTooltipElement();
  initializeDynamicLinkBinding();

  links.forEach((link) => {
    bindLinkInteractions(link);
  });

  // One proactive pass after initialization to ensure all current links have styling.
  bindLinksInSubtree(document);
}

export function applyLinkTooltips(
  links: HTMLAnchorElement[],
  tooltipTexts: string[],
  fallbackText: string,
): void {
  links.forEach((link, index) => {
    const tooltipText = tooltipTexts[index]?.trim() || fallbackText;
    link.setAttribute(TOOLTIP_ATTR, tooltipText);
    link.removeAttribute("title");
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

  const badge = document.createElement("div");
  badge.id = BADGE_ID;
  badge.style.position = "fixed";
  badge.style.bottom = "12px";
  badge.style.right = "12px";
  badge.style.zIndex = "999999";
  badge.style.background = "linear-gradient(to right, rgba(17, 17, 17, 0.68), rgba(17, 17, 17, 0.5))";
  badge.style.color = "#fff";
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
    if (bubbleState === "analyzing") {
      return;
    }
    badge.style.borderColor = "rgba(255, 255, 255, 0.75)";
    badge.style.boxShadow = "0 0 0 1px rgba(255, 255, 255, 0.2), 0 2px 6px rgba(0, 0, 0, 0.15), 0 10px 20px rgba(0, 0, 0, 0.2)";
  });
  badge.addEventListener("mouseleave", () => {
    if (bubbleState === "analyzing") {
      return;
    }
    badge.style.borderColor = "transparent";
    badge.style.boxShadow = "0 2px 6px rgba(0, 0, 0, 0.15), 0 10px 20px rgba(0, 0, 0, 0.2)";
  });
  badge.addEventListener("click", () => {
    if (bubbleState === "analyzing") {
      return;
    }
    void setFeatureActivation(!isFeatureActive);
  });

  badgeElement = badge;
  refreshBadgeState();
  document.body.appendChild(badge);
}
