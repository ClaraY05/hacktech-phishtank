console.log("AI Safe Link content script injected", window.location.href);

const discoveredLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));

const payload = discoveredLinks.map((link) => ({
  url: link.href,
  text: (link.textContent || "").trim(),
}));

const badge = document.createElement("div");
badge.textContent = `AI Safe Link active: found ${payload.length} links`;
badge.style.position = "fixed";
badge.style.bottom = "12px";
badge.style.right = "12px";
badge.style.zIndex = "999999";
badge.style.background = "#111";
badge.style.color = "#fff";
badge.style.padding = "8px 10px";
badge.style.borderRadius = "8px";
document.body.appendChild(badge);

// Placeholder hook: replace with background message or direct API request later.
if (payload.length > 0) {
  console.log(`AI Safe Link found ${payload.length} links on page`);
  payload.forEach((item, index) => {
    console.log(`[AI Safe Link] Link ${index + 1}:`, item.url, "| text:", item.text);
  });

  chrome.runtime.sendMessage(
    {
      type: "ANALYZE_LINKS",
      pageUrl: window.location.href,
      links: payload,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("AI Safe Link message error:", chrome.runtime.lastError.message);
        return;
      }
      console.log("AI Safe Link backend response:", response);
    },
  );
}
