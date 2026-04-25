import {
  getBubbleState,
  initializeFeatureActivationState,
  isFeatureActivationEnabled,
  setBadgeAnalyzing,
} from "./featureState";
import { showBadge, initializeBadgeStateSync } from "./badgeController";
import { ensureStylesInjected } from "./styleLoader";
import { ensureTooltipElement } from "./tooltipController";
import { highlightLinks as bindAndHighlightLinks } from "./linkBindings";
import { TOOLTIP_ATTR } from "./uiConstants";

initializeBadgeStateSync();

export { initializeFeatureActivationState, isFeatureActivationEnabled, getBubbleState, setBadgeAnalyzing, showBadge };

export async function highlightLinks(links: HTMLAnchorElement[]): Promise<void> {
  await initializeFeatureActivationState();
  await ensureStylesInjected();
  ensureTooltipElement();
  bindAndHighlightLinks(links);
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
