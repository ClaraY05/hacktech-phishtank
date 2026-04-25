const STYLE_ID = "ai-safe-link-style";
const HIGHLIGHT_CLASS = "ai-safe-link-highlight";
const TOOLTIP_ATTR = "data-ai-safe-tooltip";
const TOOLTIP_ID = "ai-safe-link-tooltip";
const TOOLTIP_VISIBLE_CLASS = "is-visible";
const TOOLTIP_GAP_PX = 8;
const DEFAULT_LINK_HIGHLIGHT_CSS = `
.ai-safe-link-highlight {
  outline: 2px solid transparent;
  outline-offset: 2px;
  box-shadow: inset 0 0 0 0 transparent;
  transition: box-shadow 0.45s ease, outline-color 0.2s ease;
}

.ai-safe-link-highlight:hover,
.ai-safe-link-highlight:focus-visible {
  box-shadow: inset 0 0 0 2px red !important;
  outline-color: red !important;
}

.ai-safe-link-tooltip {
  position: fixed;
  left: 0;
  top: 0;
  max-width: min(320px, calc(100vw - 24px));
  min-width: 180px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(17, 17, 17, 0.95);
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
let dynamicBindingInitialized = false;

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
  link.classList.add(HIGHLIGHT_CLASS);
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
  await ensureStylesInjected();
  ensureTooltipElement();
  initializeDynamicLinkBinding();

  links.forEach((link) => {
    bindLinkInteractions(link);
  });
}

export function applyLinkTooltips(
  links: HTMLAnchorElement[],
  tooltipTexts: string[],
  fallbackText: string,
): void {
  links.forEach((link, index) => {
    const tooltipText = tooltipTexts[index]?.trim() || fallbackText;
    link.setAttribute(TOOLTIP_ATTR, tooltipText);
    link.setAttribute("title", tooltipText);
  });
}

export function showBadge(totalLinks: number): void {
  const badge = document.createElement("div");
  badge.textContent = `AI Safe Link active: found ${totalLinks} links`;
  badge.style.position = "fixed";
  badge.style.bottom = "12px";
  badge.style.right = "12px";
  badge.style.zIndex = "999999";
  badge.style.background = "#111";
  badge.style.color = "#fff";
  badge.style.padding = "8px 10px";
  badge.style.borderRadius = "8px";
  document.body.appendChild(badge);
}
