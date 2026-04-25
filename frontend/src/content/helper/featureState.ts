import { BubbleState, HIGHLIGHT_CLASS } from "./uiConstants";

const ACTIVATION_STORAGE_KEY = "aiSafeLinkIsActive";

// Local testing override for corner bubble state.
// Set to "enabled", "disabled", or "analyzing" when testing.
const LOCAL_BUBBLE_STATE_OVERRIDE: BubbleState | null = "enabled";

let storageSyncInitialized = false;
let isFeatureActive = true;
let activationStateInitialized = false;
let bubbleState: BubbleState = "enabled";
let onStateChange: (() => void) | null = null;

function notifyStateChange(): void {
  onStateChange?.();
}

function syncBubbleStateFromActivation(): void {
  if (LOCAL_BUBBLE_STATE_OVERRIDE) {
    bubbleState = LOCAL_BUBBLE_STATE_OVERRIDE;
    isFeatureActive = bubbleState !== "disabled";
    return;
  }
  bubbleState = isFeatureActive ? "enabled" : "disabled";
}

function refreshState(): void {
  syncBubbleStateFromActivation();
  notifyStateChange();
}

export function isLinkUiEnabled(): boolean {
  return bubbleState !== "disabled";
}

export function applyFeatureStateToLink(link: HTMLAnchorElement): void {
  if (isLinkUiEnabled()) {
    link.classList.add(HIGHLIGHT_CLASS);
    return;
  }
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
    console.warn("AI Safe Link: failed to read activation state", error);
    isFeatureActive = true;
  }

  activationStateInitialized = true;
  initializeStorageSync();
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
    bubbleState = isAnalyzing ? "analyzing" : isFeatureActive ? "enabled" : "disabled";
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
    console.warn("AI Safe Link: failed to persist activation state", error);
  }
}

export function setStateChangeListener(listener: (() => void) | null): void {
  onStateChange = listener;
}
