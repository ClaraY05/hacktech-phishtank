const STYLE_ID = "ai-safe-link-style";
const HIGHLIGHT_CLASS = "ai-safe-link-highlight";
const DEFAULT_LINK_HIGHLIGHT_CSS = `
.ai-safe-link-highlight {
  box-shadow: inset 0 0 0 0 transparent;
  transition: box-shadow 0.2s ease;
}

.ai-safe-link-highlight:hover {
  box-shadow: inset 0 0 0 2px red;
}
`;

async function loadHighlightCss(): Promise<string> {
  const cssUrl = chrome.runtime.getURL("src/content/helper/styles.css");

  try {
    const response = await fetch(cssUrl);
    if (!response.ok) {
      throw new Error(`Failed to load highlight CSS (status ${response.status})`);
    }
    return await response.text();
  } catch (error) {
    console.warn("AI Safe Link: using fallback highlight CSS", error);
    return DEFAULT_LINK_HIGHLIGHT_CSS;
  }
}

async function ensureStylesInjected(): Promise<void> {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const cssText = await loadHighlightCss();

  const styleEl = document.createElement("style");
  styleEl.id = STYLE_ID;
  styleEl.textContent = cssText;
  (document.head || document.documentElement).appendChild(styleEl);
}

export async function highlightLinks(links: HTMLAnchorElement[]): Promise<void> {
  await ensureStylesInjected();
  links.forEach((link) => {
    link.classList.add(HIGHLIGHT_CLASS);
  });
}

export function showBadge(totalLinks: number): void {
  const badge = document.createElement("div");
  badge.textContent = `AI Safe Link active: found ${totalLinks} links`;
  badge.style.position = "fixed";
  badge.style.bottom = "12px";
  badge.style.right = "12px";
  badge.style.zIndex = "999999";
  badge.style.background = "#111";
  badge.style.color = "#fff";
  badge.style.padding = "8px 10px";
  badge.style.borderRadius = "8px";
  document.body.appendChild(badge);
}
