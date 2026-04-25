import { discoverLinks, buildLinkPayload } from "./helper/linkScanner";
import { collectDomSignals, sanitizeHtmlForAnalysis } from "./helper/sanitizer";
import { highlightLinks, showBadge } from "./helper/styling";
import { buildAnalyzePayload } from "./helper/payloadBuilder";
import { sendAnalyzeLinksMessage } from "./helper/messages";

const MAX_HTML_CHARS = 200_000;
const MAX_LINKS = 500;

async function runContentFlow(): Promise<void> {
  console.log("AI Safe Link content script injected", window.location.href);

  const discoveredLinks = discoverLinks(document);
  await highlightLinks(discoveredLinks);

  const payloadLinks = buildLinkPayload(discoveredLinks, MAX_LINKS);
  showBadge(payloadLinks.length);

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

  sendAnalyzeLinksMessage(message);
}

void runContentFlow();
