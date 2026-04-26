import { BubbleState, HIGHLIGHT_CLASS } from "./uiConstants";

const ACTIVATION_STORAGE_KEY = "aiSafeLinkIsActive";
const BACKEND_STATUS_POLL_MS = 1500;

// Local testing override for corner bubble state.
// Set to "enabled", "disabled", or "analyzing" when testing.
const LOCAL_BUBBLE_STATE_OVERRIDE: BubbleState | null = null;

let storageSyncInitialized = false;
let isFeatureActive = true;
let activationStateInitialized = false;
let bubbleState: BubbleState = "enabled";
let onStateChange: (() => void) | null = null;
let backendStatusSyncInitialized = false;
let backendAnalyzing = false;
let backendStatusPollInFlight = false;

function emitUiStateChange(): void {
  chrome.runtime.sendMessage(
    {
      type: "UI_STATE_CHANGE",
      state: bubbleState,
    },
    () => {
      // Ignore failures when background is unavailable.
      if (chrome.runtime.lastError) {
        return;
      }
    },
  );
}

function notifyStateChange(): void {
  emitUiStateChange();
  onStateChange?.();
}

function syncBubbleStateFromActivation(): void {
  if (LOCAL_BUBBLE_STATE_OVERRIDE) {
    bubbleState = LOCAL_BUBBLE_STATE_OVERRIDE;
    isFeatureActive = bubbleState !== "disabled";
    return;
  }
  // Disabled must win over backend "analyzing" so user toggle is always respected.
  bubbleState = isFeatureActive ? (backendAnalyzing ? "analyzing" : "enabled") : "disabled";
}

function refreshState(): void {
  syncBubbleStateFromActivation();
  notifyStateChange();
}

export function isLinkUiEnabled(): boolean {
  return bubbleState !== "disabled";
}

// Returns the element that should receive the highlight class for a given anchor.
// Title links (Google/Reddit search results) wrap a heading — highlight that so
// the bracket sits around the visible text only, not the full anchor bounding box.
// Site-card anchors (source/breadcrumb links) contain a visible favicon image but
// no heading — return null to skip them.
export function getHighlightTarget(link: HTMLAnchorElement): HTMLElement | null {
  const heading = link.querySelector<HTMLElement>("h1,h2,h3,h4,h5,h6");
  if (heading) return heading;
  const img = link.querySelector("img");
  if (img && img.offsetWidth > 12 && img.offsetHeight > 12) return null;
  return link;
}

export function applyFeatureStateToLink(link: HTMLAnchorElement): void {
  if (isLinkUiEnabled()) {
    const target = getHighlightTarget(link);
    if (target) target.classList.add(HIGHLIGHT_CLASS);
    return;
  }
  const heading = link.querySelector<HTMLElement>("h1,h2,h3,h4,h5,h6");
  if (heading) heading.classList.remove(HIGHLIGHT_CLASS);
  link.classList.remove(HIGHLIGHT_CLASS);
  link.removeAttribute("title");
}

export function applyFeatureStateToAllLinks(): void {
  Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).forEach((link) => {
    applyFeatureStateToLink(link);
  });
}

function initializeStorageSync(): void {
  if (storageSyncInitialized) {
    return;
  }
  storageSyncInitialized = true;

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[ACTIVATION_STORAGE_KEY]) {
      return;
    }
    const nextValue = changes[ACTIVATION_STORAGE_KEY].newValue;
    if (typeof nextValue !== "boolean") {
      return;
    }
    isFeatureActive = nextValue;
    applyFeatureStateToAllLinks();
    refreshState();
  });
}

function pollBackendAnalyzingStatus(): void {
  if (backendStatusPollInFlight) {
    return;
  }

  backendStatusPollInFlight = true;
  chrome.runtime.sendMessage(
    { type: "GET_BACKEND_ANALYSIS_STATUS" },
    (response: { ok?: boolean; isAnalyzing?: boolean } | undefined) => {
      backendStatusPollInFlight = false;
      const nextAnalyzing = response?.ok === true && response.isAnalyzing === true;
      if (nextAnalyzing === backendAnalyzing) {
        return;
      }
      backendAnalyzing = nextAnalyzing;
      refreshState();
    },
  );
}

function initializeBackendStatusSync(): void {
  if (backendStatusSyncInitialized) {
    return;
  }
  backendStatusSyncInitialized = true;
  pollBackendAnalyzingStatus();
  window.setInterval(pollBackendAnalyzingStatus, BACKEND_STATUS_POLL_MS);
}

export async function initializeFeatureActivationState(): Promise<boolean> {
  if (activationStateInitialized) {
    return isFeatureActive;
  }

  try {
    const result = await chrome.storage.local.get(ACTIVATION_STORAGE_KEY);
    if (typeof result[ACTIVATION_STORAGE_KEY] === "boolean") {
      isFeatureActive = result[ACTIVATION_STORAGE_KEY] as boolean;
    } else {
      await chrome.storage.local.set({ [ACTIVATION_STORAGE_KEY]: true });
      isFeatureActive = true;
    }
  } catch (error) {
    console.warn("PhishTank: failed to read activation state", error);
    isFeatureActive = true;
  }

  activationStateInitialized = true;
  initializeStorageSync();
  initializeBackendStatusSync();
  refreshState();
  return isFeatureActive;
}

export function isFeatureActivationEnabled(): boolean {
  return isFeatureActive;
}

export function getBubbleState(): BubbleState {
  return bubbleState;
}

export function setBadgeAnalyzing(isAnalyzing: boolean): void {
  if (LOCAL_BUBBLE_STATE_OVERRIDE) {
    bubbleState = LOCAL_BUBBLE_STATE_OVERRIDE;
  } else {
    bubbleState = isFeatureActive ? (isAnalyzing ? "analyzing" : "enabled") : "disabled";
  }
  notifyStateChange();
}

export async function setFeatureActivation(nextValue: boolean): Promise<void> {
  isFeatureActive = nextValue;
  applyFeatureStateToAllLinks();
  refreshState();

  try {
    await chrome.storage.local.set({ [ACTIVATION_STORAGE_KEY]: nextValue });
  } catch (error) {
    console.warn("PhishTank: failed to persist activation state", error);
  }
}

export function setStateChangeListener(listener: (() => void) | null): void {
  onStateChange = listener;
}
