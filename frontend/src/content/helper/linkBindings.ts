import { applyFeatureStateToAllLinks, applyFeatureStateToLink } from "./featureState";
import { applyResultToLink } from "./applyResult";
import { cancelHoverAnalysis, requestHoverAnalysis } from "./hoverAnalyzer";
import { hideTooltip, showTooltip } from "./tooltipController";
import { TOOLTIP_ATTR } from "./uiConstants";

let dynamicBindingInitialized = false;
let linkMutationObserver: MutationObserver | null = null;
let activeHoverLink: HTMLAnchorElement | null = null;

const ANALYZING_TOOLTIP_TEXT = "AI Safe Link: analyzing this link…";

function refreshTooltipIfActive(link: HTMLAnchorElement): void {
  if (activeHoverLink === link) {
    showTooltip(link);
  }
}

function triggerAnalysisAndRefresh(link: HTMLAnchorElement): void {
  requestHoverAnalysis(link, {
    onAnalyzing: () => {
      // Don't overwrite a real verdict if we already have one (cache hit
      // path goes straight to onResult).
      if (!link.hasAttribute("data-ai-risk")) {
        link.setAttribute(TOOLTIP_ATTR, ANALYZING_TOOLTIP_TEXT);
      }
      refreshTooltipIfActive(link);
    },
    onResult: (result) => {
      applyResultToLink(link, result);
      refreshTooltipIfActive(link);
    },
    onError: (err) => {
      link.setAttribute(TOOLTIP_ATTR, `AI Safe Link: analysis failed — ${err.message}`);
      refreshTooltipIfActive(link);
    },
  });
}

function handleHoverEnter(link: HTMLAnchorElement): void {
  activeHoverLink = link;
  showTooltip(link);
  triggerAnalysisAndRefresh(link);
}

function handleHoverLeave(link: HTMLAnchorElement): void {
  if (activeHoverLink === link) {
    activeHoverLink = null;
  }
  cancelHoverAnalysis(link);
  hideTooltip();
}

function bindLinkInteractions(link: HTMLAnchorElement): void {
  applyFeatureStateToLink(link);
  if (link.dataset.aiSafeTooltipBound === "true") {
    return;
  }

  link.dataset.aiSafeTooltipBound = "true";
  link.addEventListener("mouseenter", () => handleHoverEnter(link));
  link.addEventListener("mouseleave", () => handleHoverLeave(link));
  link.addEventListener("focus", () => handleHoverEnter(link));
  link.addEventListener("blur", () => handleHoverLeave(link));
}

function bindLinksInSubtree(root: ParentNode): void {
  root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    bindLinkInteractions(anchor);
  });
}

function initializeDynamicLinkBinding(): void {
  if (dynamicBindingInitialized) {
    return;
  }
  dynamicBindingInitialized = true;

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

export function highlightLinks(links: HTMLAnchorElement[]): void {
  initializeDynamicLinkBinding();
  links.forEach((link) => {
    bindLinkInteractions(link);
  });
  bindLinksInSubtree(document);
  applyFeatureStateToAllLinks();
}
