import { discoverLinks, buildLinkPayload } from "./helper/linkScanner";
import { collectDomSignals, sanitizeHtmlForAnalysis } from "./helper/sanitizer";
import {
  applyLinkTooltips,
  getBubbleState,
  highlightLinks,
  initializeFeatureActivationState,
  setBadgeAnalyzing,
  showBadge,
} from "./helper/styling";
import { buildAnalyzePayload } from "./helper/payloadBuilder";
import { sendAnalyzeLinksMessage } from "./helper/messages";

const MAX_HTML_CHARS = 200_000;
const MAX_LINKS = 500;
const FALLBACK_TOOLTIP_TEXT = "AI Safe Link: no analysis details available yet.";
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
    return `Risk score: ${riskScore}`;
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
    applyLinkTooltips(discoveredLinks, [], ANALYZING_TOOLTIP_TEXT);
    return;
  }

  if (payloadLinks.length === 0) {
    return;
  }

  console.log(`AI Safe Link found ${payloadLinks.length} links on page`);
  const domSignals = collectDomSignals(document);
  const sanitizedHtmlExcerpt = sanitizeHtmlForAnalysis(document, MAX_HTML_CHARS);
  const message = buildAnalyzePayload({
    pageUrl: window.location.href,
    links: payloadLinks,
    domSignals,
    sanitizedHtmlExcerpt,
  });

  setBadgeAnalyzing(true);
  const response = await sendAnalyzeLinksMessage(message);
  setBadgeAnalyzing(false);
  if (!response.ok) {
    applyLinkTooltips(discoveredLinks, [], FALLBACK_TOOLTIP_TEXT);
    return;
  }

  const tooltipTexts = extractTooltipTextsFromResponse(response.data, discoveredLinks.length);
  applyLinkTooltips(discoveredLinks, tooltipTexts, FALLBACK_TOOLTIP_TEXT);
}

void runContentFlow();
