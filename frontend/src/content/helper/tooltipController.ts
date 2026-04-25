import { getBubbleState, isLinkUiEnabled } from "./featureState";
import {
  TOOLTIP_ANALYZING_CLASS,
  TOOLTIP_ATTR,
  TOOLTIP_GAP_PX,
  TOOLTIP_ID,
  TOOLTIP_VISIBLE_CLASS,
} from "./uiConstants";

let tooltipElement: HTMLDivElement | null = null;

export function ensureTooltipElement(): HTMLDivElement {
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
  const top = canPlaceAbove ? rect.top - tooltipHeight - TOOLTIP_GAP_PX : rect.bottom + TOOLTIP_GAP_PX;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

export function showTooltip(link: HTMLAnchorElement): void {
  if (!isLinkUiEnabled()) {
    return;
  }

  const text = link.getAttribute(TOOLTIP_ATTR);
  if (!text) {
    return;
  }

  const tooltip = ensureTooltipElement();
  tooltip.textContent = text;
  if (getBubbleState() === "analyzing") {
    tooltip.classList.add(TOOLTIP_ANALYZING_CLASS);
  } else {
    tooltip.classList.remove(TOOLTIP_ANALYZING_CLASS);
  }
  placeTooltipForLink(link, tooltip);
  tooltip.classList.add(TOOLTIP_VISIBLE_CLASS);
}

export function hideTooltip(): void {
  if (!tooltipElement) {
    return;
  }
  tooltipElement.classList.remove(TOOLTIP_VISIBLE_CLASS);
}
