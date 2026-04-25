const STYLE_ID = "ai-safe-link-style";
const HIGHLIGHT_CLASS = "ai-safe-link-highlight";
const TOOLTIP_ATTR = "data-ai-safe-tooltip";
const TOOLTIP_ID = "ai-safe-link-tooltip";
const TOOLTIP_VISIBLE_CLASS = "is-visible";
const TOOLTIP_GAP_PX = 8;
const BADGE_ID = "ai-safe-link-badge";
const ACTIVATION_STORAGE_KEY = "aiSafeLinkIsActive";
const INACTIVE_BADGE_TEXT = "AI Safe Link inactive (click to enable)";
const ACTIVE_BADGE_SUFFIX = " (click to disable)";
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
`;

let tooltipElement: HTMLDivElement | null = null;
let badgeElement: HTMLDivElement | null = null;
let dynamicBindingInitialized = false;
let linkMutationObserver: MutationObserver | null = null;
let storageSyncInitialized = false;
let isFeatureActive = true;
let activationStateInitialized = false;
let currentBadgeLinkCount = 0;

function getAllLinks(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
}

function updateBadgeText(): void {
  if (!badgeElement) {
    return;
  }
  badgeElement.textContent = isFeatureActive
    ? `AI Safe Link active: found ${currentBadgeLinkCount} links${ACTIVE_BADGE_SUFFIX}`
    : INACTIVE_BADGE_TEXT;
}

function applyFeatureStateToLink(link: HTMLAnchorElement): void {
  if (isFeatureActive) {
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

  if (!isFeatureActive) {
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
    updateBadgeText();
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

async function setFeatureActivation(nextValue: boolean): Promise<void> {
  isFeatureActive = nextValue;
  applyFeatureStateToAllLinks();
  updateBadgeText();
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
  if (!isFeatureActive) {
    return;
  }

  const text = link.getAttribute(TOOLTIP_ATTR);
  if (!text) {
    return;
  }

  const tooltip = ensureTooltipElement();
  tooltip.textContent = text;
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
    updateBadgeText();
    return;
  }

  const existing = document.getElementById(BADGE_ID);
  if (existing && existing instanceof HTMLDivElement) {
    badgeElement = existing;
    updateBadgeText();
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
    badge.style.borderColor = "rgba(255, 255, 255, 0.75)";
    badge.style.boxShadow = "0 0 0 1px rgba(255, 255, 255, 0.2), 0 2px 6px rgba(0, 0, 0, 0.15), 0 10px 20px rgba(0, 0, 0, 0.2)";
  });
  badge.addEventListener("mouseleave", () => {
    badge.style.borderColor = "transparent";
    badge.style.boxShadow = "0 2px 6px rgba(0, 0, 0, 0.15), 0 10px 20px rgba(0, 0, 0, 0.2)";
  });
  badge.addEventListener("click", () => {
    void setFeatureActivation(!isFeatureActive);
  });

  badgeElement = badge;
  updateBadgeText();
  document.body.appendChild(badge);
}
