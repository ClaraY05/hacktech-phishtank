import { discoverLinks, buildLinkPayload } from "./helper/linkScanner";
import { collectDomSignals, sanitizeHtmlForAnalysis } from "./helper/sanitizer";
import {
  getBubbleState,
  highlightLinks,
  initializeFeatureActivationState,
  showBadge,
} from "./helper/styling";
import { setPageContext, getAnalyzedResults } from "./helper/hoverAnalyzer";

type DomSignals = ReturnType<typeof collectDomSignals>;

let cachedDomSignals: DomSignals | null = null;
let cachedTotalLinks = 0;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_PAGE_SUMMARY") {
    sendResponse({
      ok: true,
      domSignals: cachedDomSignals,
      totalLinks: cachedTotalLinks,
      pageUrl: window.location.href,
      analyzedResults: getAnalyzedResults(),
    });
  }
});

const MAX_HTML_CHARS = 200_000;
const MAX_LINKS = 500;
const FALLBACK_TOOLTIP_TEXT = "PhishTank: no analysis details available yet.";
const ANALYZING_TOOLTIP_TEXT = "analysis in progress";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractTooltipText(entry: unknown): string | undefined {
  if (typeof entry === "string") {
    return entry;
  }

  if (!isRecord(entry)) {
    return undefined;
  }

  const textFields = [
    "tooltip",
    "description",
    "explanation",
    "reason",
    "summary",
    "risk_label",
    "verdict",
  ];

  for (const field of textFields) {
    const value = entry[field];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  const riskScore = entry.risk_score;
  if (typeof riskScore === "number") {
    const normalizedScore = Math.max(0, Math.min(100, Math.round(riskScore)));
    return `Risk score: ${normalizedScore}/100`;
  }

  return undefined;
}

function extractTooltipTextsFromResponse(data: unknown, expectedCount: number): string[] {
  const directList = Array.isArray(data) ? data : undefined;
  const wrappedList =
    isRecord(data) && Array.isArray(data.results)
      ? data.results
      : isRecord(data) && Array.isArray(data.links)
        ? data.links
        : isRecord(data) && Array.isArray(data.analyses)
          ? data.analyses
          : isRecord(data) && Array.isArray(data.items)
            ? data.items
            : undefined;

  const entries = directList ?? wrappedList;
  if (!entries) {
    return [];
  }

  return entries.slice(0, expectedCount).map((entry) => extractTooltipText(entry) || FALLBACK_TOOLTIP_TEXT);
}

async function runContentFlow(): Promise<void> {
  console.log("PhishTank content script injected", window.location.href);
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
  console.log(`PhishTank found ${payloadLinks.length} links on page`);
  const domSignals = collectDomSignals(document);
  cachedDomSignals = domSignals;
  cachedTotalLinks = payloadLinks.length;
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
