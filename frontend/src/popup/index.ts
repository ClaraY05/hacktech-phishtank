import { getPopupMarkup } from "./components/PopupApp";
import { popupStyles } from "./components/styles";

type BubbleState = "enabled" | "disabled" | "analyzing";

type DomSignals = {
  has_password_form: boolean;
  num_forms: number;
  num_iframes: number;
  num_external_scripts: number;
  suspicious_keywords: string[];
};

type AnalyzedResult = {
  url: string;
  score: number;
  explanation?: string;
};

type PageSummary = {
  domSignals: DomSignals | null;
  totalLinks: number;
  analyzedResults: AnalyzedResult[];
};

type PageSummaryResponse = {
  ok?: boolean;
  domSignals?: DomSignals;
  totalLinks?: number;
  analyzedResults?: AnalyzedResult[];
};

type TabResultsResponse = {
  ok?: boolean;
  pageUrl?: string | null;
  results?: AnalyzedResult[];
};

type LinkAnalysisItem = {
  url: string;
  rating: number;
  explanation: string;
};

let expandedLinkUrl: string | null = null;

const POPUP_PORT_NAME = "ai-safe-link-popup";
let currentState: BubbleState = "enabled";
let currentTabId: number | null = null;
let currentSummary: PageSummary = { domSignals: null, totalLinks: 0, analyzedResults: [] };
let livePort: chrome.runtime.Port | null = null;
let analyzingTimerId: number | null = null;

type LiveUpdate = {
  type: "TAB_UPDATE";
  tabId: number;
  pageUrl: string;
  data: { url: string; score: number; explanation?: string };
};

function mergeLiveResult(data: LiveUpdate["data"]): void {
  if (!isValidAnalyzedResult(data)) return;
  const idx = currentSummary.analyzedResults.findIndex((r) => r.url === data.url);
  const next: AnalyzedResult = {
    url: data.url,
    score: data.score,
    explanation: data.explanation,
  };
  if (idx >= 0) currentSummary.analyzedResults[idx] = next;
  else currentSummary.analyzedResults.push(next);
}

function subscribeToLiveUpdates(): void {
  if (livePort || currentTabId === null) return;
  try {
    livePort = chrome.runtime.connect({ name: POPUP_PORT_NAME });
  } catch {
    return;
  }
  livePort.onMessage.addListener((msg: LiveUpdate) => {
    if (msg?.type !== "TAB_UPDATE" || msg.tabId !== currentTabId) return;
    mergeLiveResult(msg.data);
    setViewMode(false);
    renderDashboard(currentState, currentSummary);
  });
  livePort.onDisconnect.addListener(() => {
    livePort = null;
  });
}

const rootEl = document.getElementById("popupRoot");
if (rootEl) {
  rootEl.innerHTML = `<style>${popupStyles}</style>${getPopupMarkup()}`;
}

const analyzingViewEl = document.getElementById("analyzingView");
const dashboardViewEl = document.getElementById("dashboardView");
const analyzingStatusEl = document.getElementById("status");
const currentUrlEl = document.getElementById("currentUrl");
const statusChipEl = document.getElementById("statusChip");
const safetyDonutEl = document.getElementById("safetyDonut");
const redCountEl = document.getElementById("redCount");
const yellowCountEl = document.getElementById("yellowCount");
const greenCountEl = document.getElementById("greenCount");
const totalCountEl = document.getElementById("totalCount");
const totalCountChipEl = document.getElementById("totalCountChip");
const avgScoreEl = document.getElementById("avgScore");
const explanationTextEl = document.getElementById("explanationText");
const linkTableEl = document.getElementById("linkTable");
const numFormsEl = document.getElementById("numForms");
const numIframesEl = document.getElementById("numIframes");
const numExtScriptsEl = document.getElementById("numExtScripts");
const hasPasswordFormEl = document.getElementById("hasPasswordForm");
const suspiciousKeywordsEl = document.getElementById("suspiciousKeywords");

function scoreToRating(score: number): number {
  // Keep popup bucket math aligned with content hover risk classification.
  return Math.max(0, Math.min(100, Math.round(score)));
}

function isValidAnalyzedResult(value: unknown): value is AnalyzedResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AnalyzedResult).url === "string" &&
    typeof (value as AnalyzedResult).score === "number" &&
    Number.isFinite((value as AnalyzedResult).score)
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function setViewMode(showAnalyzingView: boolean): void {
  if (analyzingViewEl) analyzingViewEl.classList.toggle("is-hidden", !showAnalyzingView);
  if (dashboardViewEl) dashboardViewEl.classList.toggle("is-hidden", showAnalyzingView);
}

function setAnalyzingTextAnimation(): void {
  if (!analyzingStatusEl) return;
  if (analyzingTimerId !== null) return;

  const variants = [
    "Extension active and monitoring links.",
    "Extension active and monitoring links..",
  ];
  let index = 0;
  analyzingStatusEl.textContent = variants[index];

  analyzingTimerId = window.setInterval(() => {
    index = (index + 1) % variants.length;
    analyzingStatusEl.textContent = variants[index];
  }, 700);
}

function getBucketCounts(items: LinkAnalysisItem[]): { red: number; yellow: number; green: number; total: number } {
  let red = 0;
  let yellow = 0;
  let green = 0;

  items.forEach(({ rating }) => {
    if (rating >= 67) {
      red += 1;
    } else if (rating >= 34) {
      yellow += 1;
    } else {
      green += 1;
    }
  });

  return { red, yellow, green, total: items.length };
}

function buildAvgScore(items: LinkAnalysisItem[]): string {
  if (items.length === 0) return "—";
  const avg = items.reduce((sum, i) => sum + i.rating, 0) / items.length;
  return `${avg.toFixed(1)} / 100`;
}

function buildExplanation(red: number, yellow: number, green: number, total: number): string {
  if (total === 0) return "No links have been analyzed yet. Hover over links on the page to start.";
  if (red >= yellow && red >= green) return "Most analyzed links fall into the high-risk bucket. Review red-rated links first and avoid interacting with suspicious destinations.";
  if (yellow >= red && yellow >= green) return "Most analyzed links are medium risk. Proceed with caution and prioritize deeper checks on yellow-rated links.";
  return "Most analyzed links are low risk. Continue monitoring for changes and periodically review newly discovered links.";
}

function renderDonut(red: number, yellow: number, green: number, total: number): void {
  if (!safetyDonutEl) return;

  if (total === 0) {
    safetyDonutEl.style.background = "conic-gradient(#d9d9d9 0turn 1turn)";
    return;
  }

  const redPct = red / total;
  const yellowPct = yellow / total;
  const greenPct = green / total;
  const yellowEnd = redPct + yellowPct;
  const greenEnd = yellowEnd + greenPct;

  safetyDonutEl.style.background = `conic-gradient(
    var(--coral) 0turn ${redPct}turn,
    #e8a90e ${redPct}turn ${yellowEnd}turn,
    var(--teal) ${yellowEnd}turn ${greenEnd}turn
  )`;
}

function renderTable(items: LinkAnalysisItem[]): void {
  if (!linkTableEl) return;

  if (items.length === 0) {
    linkTableEl.innerHTML = `
      <div class="item">
        <div class="item-row">
          <span class="item-url mono">No links available</span>
          <span class="chip warn">0/100</span>
        </div>
      </div>
    `;
    return;
  }

  linkTableEl.innerHTML = items
    .map((item) => {
      const chipClass = item.rating >= 67 ? "danger" : item.rating >= 34 ? "warn" : "live";
      const isExpanded = expandedLinkUrl === item.url;
      const toggleLabel = isExpanded ? "Hide reason" : "View reason";
      const safeUrl = escapeHtml(item.url);
      const safeExplanation = escapeHtml(item.explanation || "No reason provided.");
      return `
        <div class="item ${isExpanded ? "is-expanded" : ""}" data-link-url="${safeUrl}">
          <div class="item-row">
            <span class="item-url mono" title="${safeUrl}">${safeUrl}</span>
            <span class="chip ${chipClass}">${item.rating}/100</span>
          </div>
          <button type="button" class="item-toggle">${toggleLabel}</button>
          <div class="item-reason">${safeExplanation}</div>
        </div>
      `;
    })
    .join("");

  linkTableEl.querySelectorAll<HTMLElement>(".item").forEach((row) => {
    row.addEventListener("click", () => {
      const url = row.dataset.linkUrl;
      if (!url) return;
      expandedLinkUrl = expandedLinkUrl === url ? null : url;
      renderTable(items);
    });
  });
}

function renderSignals(domSignals: DomSignals | null): void {
  if (!domSignals) return;

  if (numFormsEl) numFormsEl.textContent = String(domSignals.num_forms);
  if (numIframesEl) numIframesEl.textContent = String(domSignals.num_iframes);
  if (numExtScriptsEl) numExtScriptsEl.textContent = String(domSignals.num_external_scripts);
  if (hasPasswordFormEl) {
    hasPasswordFormEl.textContent = domSignals.has_password_form ? "Yes" : "No";
    hasPasswordFormEl.style.color = domSignals.has_password_form ? "var(--coral)" : "var(--teal)";
  }
  if (suspiciousKeywordsEl) {
    const keywords = domSignals.suspicious_keywords;
    if (keywords.length > 0) {
      suspiciousKeywordsEl.classList.remove("is-hidden");
      suspiciousKeywordsEl.innerHTML = keywords
        .map((kw) => `<span class="keyword-chip">${escapeHtml(kw)}</span>`)
        .join("");
    } else {
      suspiciousKeywordsEl.classList.add("is-hidden");
    }
  }
}

function mergeAnalyzedResults(primary: AnalyzedResult[], secondary: AnalyzedResult[]): AnalyzedResult[] {
  const byUrl = new Map<string, AnalyzedResult>();

  for (const result of primary) {
    if (isValidAnalyzedResult(result)) byUrl.set(result.url, result);
  }

  for (const result of secondary) {
    if (isValidAnalyzedResult(result)) byUrl.set(result.url, result);
  }

  return Array.from(byUrl.values());
}

async function fetchPageSummary(tabId: number | null): Promise<PageSummary> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_PAGE_SUMMARY", tabId }, (response: PageSummaryResponse | undefined) => {
      if (chrome.runtime.lastError || !response?.ok) {
        resolve({ domSignals: null, totalLinks: 0, analyzedResults: [] });
        return;
      }
      resolve({
        domSignals: response.domSignals ?? null,
        totalLinks: response.totalLinks ?? 0,
        analyzedResults: (response.analyzedResults ?? []).filter(isValidAnalyzedResult),
      });
    });
  });
}

async function fetchCachedTabResults(tabId: number | null): Promise<AnalyzedResult[]> {
  if (tabId === null) return [];

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_TAB_RESULTS", tabId }, (response: TabResultsResponse | undefined) => {
      if (chrome.runtime.lastError || !response?.ok) {
        resolve([]);
        return;
      }
      resolve((response.results ?? []).filter(isValidAnalyzedResult));
    });
  });
}

async function fetchActiveTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(tabs[0] ?? null);
    });
  });
}

async function fetchUiState(): Promise<BubbleState> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_UI_STATE" }, (response?: { ok?: boolean; state?: BubbleState }) => {
      if (chrome.runtime.lastError) {
        resolve("enabled");
        return;
      }

      const state = response?.state;
      if (state === "enabled" || state === "disabled" || state === "analyzing") {
        resolve(state);
        return;
      }

      resolve("enabled");
    });
  });
}

function renderDashboard(state: BubbleState, summary: PageSummary): void {
  currentState = state;
  currentSummary = summary;

  const items: LinkAnalysisItem[] = summary.analyzedResults.map((r) => ({
    url: r.url,
    rating: scoreToRating(r.score),
    explanation: r.explanation ?? "No reason provided.",
  }));

  const { red, yellow, green, total } = getBucketCounts(items);

  if (statusChipEl) {
    statusChipEl.textContent = state;
    statusChipEl.classList.remove("live", "warn", "danger");
    statusChipEl.classList.add(state === "disabled" ? "warn" : "live");
  }

  if (redCountEl) redCountEl.textContent = String(red);
  if (yellowCountEl) yellowCountEl.textContent = String(yellow);
  if (greenCountEl) greenCountEl.textContent = String(green);
  if (totalCountEl) totalCountEl.textContent = String(total);
  if (totalCountChipEl) totalCountChipEl.textContent = `${total} analyzed`;
  if (avgScoreEl) avgScoreEl.textContent = buildAvgScore(items);
  if (explanationTextEl) explanationTextEl.textContent = buildExplanation(red, yellow, green, total);

  renderDonut(red, yellow, green, total);
  renderTable(items);
  renderSignals(summary.domSignals);
}

async function renderForState(state: BubbleState): Promise<void> {
  const [pageSummary, cachedResults] = await Promise.all([
    fetchPageSummary(currentTabId),
    fetchCachedTabResults(currentTabId),
  ]);
  const summary: PageSummary = {
    ...pageSummary,
    analyzedResults: mergeAnalyzedResults(pageSummary.analyzedResults, cachedResults),
  };
  const hasCachedAnalyzedLinks = summary.analyzedResults.length > 0;
  const showAnalyzingView = state === "analyzing" && !hasCachedAnalyzedLinks;

  setViewMode(showAnalyzingView);

  if (showAnalyzingView) {
    setAnalyzingTextAnimation();
    return;
  }

  renderDashboard(state, summary);
}

function renderCurrentUrl(tab: chrome.tabs.Tab | null): void {
  if (!currentUrlEl) return;

  const url = tab?.url;
  currentUrlEl.textContent = url || "Current tab URL unavailable.";
}

async function initializePopup(): Promise<void> {
  const [tab, state] = await Promise.all([fetchActiveTab(), fetchUiState()]);
  currentTabId = tab?.id ?? null;
  currentState = state;
  renderCurrentUrl(tab);
  subscribeToLiveUpdates();
  await renderForState(state);
}

void initializePopup();
