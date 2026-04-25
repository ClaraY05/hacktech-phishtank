import { getPopupMarkup } from "./components/PopupApp";
import { popupStyles } from "./components/styles";

type BubbleState = "enabled" | "disabled" | "analyzing";

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
const explanationTextEl = document.getElementById("explanationText");
const linkTableEl = document.getElementById("linkTable");

type LinkAnalysisItem = {
  url: string;
  rating: number;
};

const MOCK_LINK_ANALYSIS: LinkAnalysisItem[] = [
  { url: "https://portal.example-bank-login.com/session/verify", rating: 2 },
  { url: "https://docs.safe-site.dev/getting-started", rating: 9 },
  { url: "https://downloads.assets-host.io/toolkit.zip", rating: 6 },
  { url: "https://status.company.example/health", rating: 8 },
  { url: "https://auth-check.security-update.example/reset", rating: 3 },
  { url: "https://community.example.dev/thread/482", rating: 7 },
  { url: "https://mirror.package-source.example/artifact", rating: 5 },
  { url: "https://trusted-cdn.example.com/library.min.js", rating: 10 },
  { url: "https://profile-updates.account-check.example/login", rating: 1 },
];

function setAnalyzingTextAnimation(): void {
  if (!analyzingStatusEl) {
    return;
  }

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

function renderForState(state: BubbleState): void {
  const isAnalyzing = state === "analyzing";

  if (analyzingViewEl) {
    analyzingViewEl.classList.toggle("is-hidden", !isAnalyzing);
  }

  if (dashboardViewEl) {
    dashboardViewEl.classList.toggle("is-hidden", isAnalyzing);
  }

  if (isAnalyzing) {
    setAnalyzingTextAnimation();
    return;
  }

  renderDashboard(state);
}

function getBucketCounts(items: LinkAnalysisItem[]): { red: number; yellow: number; green: number; total: number } {
  let red = 0;
  let yellow = 0;
  let green = 0;

  items.forEach(({ rating }) => {
    if (rating >= 1 && rating <= 3) {
      red += 1;
    } else if (rating >= 4 && rating <= 7) {
      yellow += 1;
    } else if (rating >= 8 && rating <= 10) {
      green += 1;
    }
  });

  return { red, yellow, green, total: items.length };
}

function buildExplanation(red: number, yellow: number, green: number, total: number): string {
  if (total === 0) {
    return "No links have been analyzed yet.";
  }

  if (red >= yellow && red >= green) {
    return "Most analyzed links fall into the high-risk bucket. Review red-rated links first and avoid interacting with suspicious destinations.";
  }

  if (yellow >= red && yellow >= green) {
    return "Most analyzed links are medium risk. Proceed with caution and prioritize deeper checks on yellow-rated links.";
  }

  return "Most analyzed links are low risk. Continue monitoring for changes and periodically review newly discovered links.";
}

function renderDonut(red: number, yellow: number, green: number, total: number): void {
  if (!safetyDonutEl) {
    return;
  }

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
  if (!linkTableEl) {
    return;
  }

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
      const chipClass = item.rating <= 3 ? "danger" : item.rating <= 7 ? "warn" : "live";
      return `
        <div class="item">
          <div class="item-row">
            <span class="item-url mono" title="${item.url}">${item.url}</span>
            <span class="chip ${chipClass}">${item.rating}/10</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderDashboard(state: BubbleState): void {
  const { red, yellow, green, total } = getBucketCounts(MOCK_LINK_ANALYSIS);

  if (statusChipEl) {
    statusChipEl.textContent = state;
    statusChipEl.classList.remove("live", "warn", "danger");
    statusChipEl.classList.add(state === "disabled" ? "warn" : "live");
  }

  if (redCountEl) {
    redCountEl.textContent = String(red);
  }
  if (yellowCountEl) {
    yellowCountEl.textContent = String(yellow);
  }
  if (greenCountEl) {
    greenCountEl.textContent = String(green);
  }
  if (totalCountEl) {
    totalCountEl.textContent = String(total);
  }
  if (totalCountChipEl) {
    totalCountChipEl.textContent = `${total} total`;
  }
  if (explanationTextEl) {
    explanationTextEl.textContent = buildExplanation(red, yellow, green, total);
  }

  renderDonut(red, yellow, green, total);
  renderTable(MOCK_LINK_ANALYSIS);
}

function renderCurrentUrl(): void {
  if (!currentUrlEl) {
    return;
  }

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
