import { discoverLinks, buildLinkPayload } from "./helper/linkScanner";
import { collectDomSignals, sanitizeHtmlForAnalysis } from "./helper/sanitizer";
import {
  getBubbleState,
  highlightLinks,
  initializeFeatureActivationState,
  setBadgeAnalyzing,
  showBadge,
} from "./helper/styling";
import { streamBatchAnalysis, scoreToRating, type LinkAnalysisResult } from "./helper/batchStream";
import { TOOLTIP_ATTR, RISK_ATTR, RISK_LOW, RISK_MEDIUM, RISK_HIGH } from "./helper/uiConstants";

const MAX_HTML_CHARS = 200_000;
const MAX_LINKS = 500;
const FALLBACK_TOOLTIP_TEXT = "AI Safe Link: no analysis details available yet.";
const ANALYZING_TOOLTIP_TEXT = "analysis in progress";

function riskClass(result: LinkAnalysisResult): string {
  if (result.risk === "HIGH") return RISK_HIGH;
  if (result.risk === "MEDIUM") return RISK_MEDIUM;
  if (result.risk === "LOW") return RISK_LOW;
  const rating = scoreToRating(result.score);
  if (rating <= 3) return RISK_HIGH;
  if (rating <= 7) return RISK_MEDIUM;
  return RISK_LOW;
}

function applyResultToLinks(
  result: LinkAnalysisResult,
  linksByUrl: Map<string, HTMLAnchorElement[]>,
): void {
  const links = linksByUrl.get(result.url) ?? [];
  const tooltipText = result.explanation || FALLBACK_TOOLTIP_TEXT;
  const rc = riskClass(result);
  for (const link of links) {
    link.setAttribute(TOOLTIP_ATTR, tooltipText);
    link.setAttribute(RISK_ATTR, rc);
    link.removeAttribute("title");
  }
}

function buildLinksByUrl(links: HTMLAnchorElement[]): Map<string, HTMLAnchorElement[]> {
  const map = new Map<string, HTMLAnchorElement[]>();
  for (const link of links) {
    const url = link.href;
    if (!map.has(url)) map.set(url, []);
    map.get(url)!.push(link);
  }
  return map;
}

async function runContentFlow(): Promise<void> {
  console.log("AI Safe Link content script injected", window.location.href);
  await initializeFeatureActivationState();

  const discoveredLinks = discoverLinks(document);
  await highlightLinks(discoveredLinks);

  const payloadLinks = buildLinkPayload(discoveredLinks, MAX_LINKS);
  showBadge(payloadLinks.length);
  const bubbleState = getBubbleState();

  if (bubbleState === "disabled") {
    return;
  }

  if (bubbleState === "analyzing") {
    for (const link of discoveredLinks) {
      link.setAttribute(TOOLTIP_ATTR, ANALYZING_TOOLTIP_TEXT);
    }
    return;
  }

  if (payloadLinks.length === 0) {
    return;
  }

  console.log(`AI Safe Link found ${payloadLinks.length} links on page`);
  const domSignals = collectDomSignals(document);
  const sanitizedHtmlExcerpt = sanitizeHtmlForAnalysis(document, MAX_HTML_CHARS);
  const linksByUrl = buildLinksByUrl(discoveredLinks);

  setBadgeAnalyzing(true);
  try {
    await streamBatchAnalysis(
      {
        pageUrl: window.location.href,
        links: payloadLinks,
        domSignals,
        sanitizedHtmlExcerpt,
        contentHashHint: `${window.location.hostname}:${payloadLinks.length}:${sanitizedHtmlExcerpt.length}`,
      },
      (result) => applyResultToLinks(result, linksByUrl),
    );
  } catch (err) {
    console.error("AI Safe Link: batch analysis failed", err);
    for (const link of discoveredLinks) {
      if (!link.getAttribute(TOOLTIP_ATTR)) {
        link.setAttribute(TOOLTIP_ATTR, FALLBACK_TOOLTIP_TEXT);
      }
    }
  } finally {
    setBadgeAnalyzing(false);
  }
}

void runContentFlow();
