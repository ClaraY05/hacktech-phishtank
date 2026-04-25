import { discoverLinks, buildLinkPayload } from "./helper/linkScanner";
import { collectDomSignals, sanitizeHtmlForAnalysis } from "./helper/sanitizer";
import {
  getBubbleState,
  highlightLinks,
  initializeFeatureActivationState,
  showBadge,
} from "./helper/styling";
import { setPageContext } from "./helper/hoverAnalyzer";

const MAX_HTML_CHARS = 200_000;
const MAX_LINKS = 500;

async function runContentFlow(): Promise<void> {
  console.log("AI Safe Link content script injected", window.location.href);
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
  const domSignals = collectDomSignals(document);
  const sanitizedHtmlExcerpt = sanitizeHtmlForAnalysis(document, MAX_HTML_CHARS);
  setPageContext({
    pageUrl: window.location.href,
    domSignals,
    sanitizedHtmlExcerpt,
  });

  console.log(
    `AI Safe Link ready — ${payloadLinks.length} links found; analysis fires on hover`,
  );
}

void runContentFlow();
