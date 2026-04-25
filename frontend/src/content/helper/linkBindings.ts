import { applyFeatureStateToAllLinks, applyFeatureStateToLink } from "./featureState";
import { hideTooltip, showTooltip } from "./tooltipController";

let dynamicBindingInitialized = false;
let linkMutationObserver: MutationObserver | null = null;

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
