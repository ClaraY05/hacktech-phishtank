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
};

type PageSummary = {
  domSignals: DomSignals | null;
  totalLinks: number;
  analyzedResults: AnalyzedResult[];
};

type LinkAnalysisItem = {
  url: string;
  rating: number;
};

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
  return Math.max(1, Math.min(10, 10 - Math.round(score / 11)));
}

function setAnalyzingTextAnimation(): void {
  if (!analyzingStatusEl) return;

  const variants = [
    "Extension active and monitoring links.",
    "Extension active and monitoring links..",
  ];
  let index = 0;
  analyzingStatusEl.textContent = variants[index];

  window.setInterval(() => {
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
  return `${avg.toFixed(1)} / 10`;
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
          <span class="chip warn">0/10</span>
        </div>
      </div>
    `;
    return;
  }

  linkTableEl.innerHTML = items
    .map((item) => {
      const chipClass = item.rating >= 67 ? "danger" : item.rating >= 34 ? "warn" : "live";
      return `
        <div class="item">
          <div class="item-row">
            <span class="item-url mono" title="${item.url}">${item.url}</span>
            <span class="chip ${chipClass}">${item.rating}/100</span>
          </div>
        </div>
      `;
    })
    .join("");
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
        .map((kw) => `<span class="keyword-chip">${kw}</span>`)
        .join("");
    } else {
      suspiciousKeywordsEl.classList.add("is-hidden");
    }
  }
}

async function fetchPageSummary(): Promise<PageSummary> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_PAGE_SUMMARY" }, (response: { ok?: boolean; domSignals?: DomSignals; totalLinks?: number; analyzedResults?: AnalyzedResult[] } | undefined) => {
      if (chrome.runtime.lastError || !response?.ok) {
        resolve({ domSignals: null, totalLinks: 0, analyzedResults: [] });
        return;
      }
      resolve({
        domSignals: response.domSignals ?? null,
        totalLinks: response.totalLinks ?? 0,
        analyzedResults: response.analyzedResults ?? [],
      });
    });
  });
}

function renderDashboard(state: BubbleState, summary: PageSummary): void {
  const items: LinkAnalysisItem[] = summary.analyzedResults.map((r) => ({
    url: r.url,
    rating: scoreToRating(r.score),
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

function renderForState(state: BubbleState): void {
  const isAnalyzing = state === "analyzing";

  if (analyzingViewEl) analyzingViewEl.classList.toggle("is-hidden", !isAnalyzing);
  if (dashboardViewEl) dashboardViewEl.classList.toggle("is-hidden", isAnalyzing);

  if (isAnalyzing) {
    setAnalyzingTextAnimation();
    return;
  }

  void fetchPageSummary().then((summary) => renderDashboard(state, summary));
}

function renderCurrentUrl(): void {
  if (!currentUrlEl) return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      currentUrlEl.textContent = "Unable to resolve current tab URL.";
      return;
    }

    const url = tabs[0]?.url;
    currentUrlEl.textContent = url || "Current tab URL unavailable.";
  });
}

renderCurrentUrl();

chrome.runtime.sendMessage({ type: "GET_UI_STATE" }, (response?: { ok?: boolean; state?: BubbleState }) => {
  if (chrome.runtime.lastError) {
    renderForState("enabled");
    return;
  }

  const state = response?.state;
  if (state === "enabled" || state === "disabled" || state === "analyzing") {
    renderForState(state);
    return;
  }

  renderForState("enabled");
});
