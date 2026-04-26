// Lazy per-link analysis. The content script binds hover handlers but
// fires no requests on page load — the backend pipeline only runs for
// links the user actually hovers (or focuses with the keyboard).
//
// Three layers cooperate to keep API usage low:
//   1. Hover-intent debounce (180ms) so mouse fly-bys never fire.
//   2. URL-keyed dedupe so re-hovers/in-flight overlaps share one request.
//   3. Token-bucket rate limit in the background SW (rateLimiter.ts) so
//      even a fresh page with hundreds of distinct hovers can't exceed
//      the 14 requests/min ceiling.

import { streamBatchAnalysis, type LinkAnalysisResult } from "./batchStream";

const HOVER_DEBOUNCE_MS = 180;

type PageContext = {
  pageUrl: string;
  domSignals: object;
  sanitizedHtmlExcerpt: string;
};

export type HoverCallbacks = {
  onAnalyzing: () => void;
  onResult: (result: LinkAnalysisResult) => void;
  onError?: (err: Error) => void;
};

let pageContext: PageContext | null = null;
const resultByUrl = new Map<string, Promise<LinkAnalysisResult>>();
const resolvedByUrl = new Map<string, LinkAnalysisResult>();
const debounceTimers = new WeakMap<HTMLAnchorElement, number>();

export function getAnalyzedResults(): LinkAnalysisResult[] {
  return Array.from(resolvedByUrl.values());
}

export function setPageContext(ctx: PageContext): void {
  pageContext = ctx;
}

export function cancelHoverAnalysis(link: HTMLAnchorElement): void {
  const timer = debounceTimers.get(link);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    debounceTimers.delete(link);
  }
}

export function requestHoverAnalysis(
  link: HTMLAnchorElement,
  callbacks: HoverCallbacks,
): void {
  cancelHoverAnalysis(link);
  const url = link.href;

  // Fast path: result already cached or in flight — wire callbacks
  // directly to the shared promise, skip the debounce delay.
  const cached = resultByUrl.get(url);
  if (cached) {
    cached
      .then(callbacks.onResult)
      .catch((err: unknown) => {
        callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
      });
    return;
  }

  // Slow path: never seen this URL — debounce so a fly-by doesn't fire.
  const timer = window.setTimeout(() => {
    debounceTimers.delete(link);
    void kickoffAnalysis(link, callbacks);
  }, HOVER_DEBOUNCE_MS);
  debounceTimers.set(link, timer);
}

async function kickoffAnalysis(
  link: HTMLAnchorElement,
  callbacks: HoverCallbacks,
): Promise<void> {
  if (!pageContext) {
    console.warn("PhishTank: page context not set; skipping hover analysis");
    return;
  }

  const url = link.href;
  let promise = resultByUrl.get(url);

  if (!promise) {
    callbacks.onAnalyzing();
    promise = fetchSingleUrlAnalysis(url, (link.textContent ?? "").trim(), pageContext);
    resultByUrl.set(url, promise);
    promise.catch(() => {
      // Don't cache failures — let the next hover retry.
      resultByUrl.delete(url);
    });
  }

  try {
    const result = await promise;
    resolvedByUrl.set(url, result);
    callbacks.onResult(result);
  } catch (err) {
    callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
  }
}

function fetchSingleUrlAnalysis(
  url: string,
  text: string,
  ctx: PageContext,
): Promise<LinkAnalysisResult> {
  return new Promise((resolve, reject) => {
    let captured: LinkAnalysisResult | null = null;
    streamBatchAnalysis(
      {
        pageUrl: ctx.pageUrl,
        links: [{ url, text }],
        domSignals: ctx.domSignals,
        sanitizedHtmlExcerpt: ctx.sanitizedHtmlExcerpt,
        contentHashHint: `hover:${url}`,
      },
      (result) => {
        captured = result;
      },
    )
      .then(() => {
        if (captured) resolve(captured);
        else reject(new Error("backend returned no analysis result"));
      })
      .catch((err: unknown) => {
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}
