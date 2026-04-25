import { STYLE_ID } from "./uiConstants";

const DEFAULT_FALLBACK_CSS = `
.ai-safe-link-highlight { outline: 2px solid transparent; }
.ai-safe-link-highlight:hover, .ai-safe-link-highlight:focus-visible { outline-color: #f5b301 !important; }
.ai-safe-link-tooltip { position: fixed; left: 0; top: 0; opacity: 0; pointer-events: none; z-index: 2147483647; padding: 8px 10px; border-radius: 6px; background: rgba(17, 17, 17, 0.85); color: #fff; }
.ai-safe-link-tooltip.is-visible { opacity: 1; }
.ai-safe-link-badge--analyzing { width: 210px; box-sizing: border-box; text-align: center; }
`;

export async function ensureStylesInjected(): Promise<void> {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const cssUrl = chrome.runtime.getURL("src/content/styles/index.css");
  const parent = document.head || document.documentElement;

  const linkEl = document.createElement("link");
  linkEl.id = STYLE_ID;
  linkEl.rel = "stylesheet";
  linkEl.href = cssUrl;
  linkEl.addEventListener("error", () => {
    console.warn("AI Safe Link: stylesheet load failed, using fallback CSS");
    if (document.getElementById(STYLE_ID)) {
      document.getElementById(STYLE_ID)?.remove();
    }
    const fallbackEl = document.createElement("style");
    fallbackEl.id = STYLE_ID;
    fallbackEl.textContent = DEFAULT_FALLBACK_CSS;
    parent.appendChild(fallbackEl);
  });

  parent.appendChild(linkEl);
}
