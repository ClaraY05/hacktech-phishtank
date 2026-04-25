const discoveredLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));

const payload = discoveredLinks.slice(0, 20).map((link) => ({
  url: link.href,
  text: (link.textContent || "").trim(),
}));

// Placeholder hook: replace with background message or direct API request later.
if (payload.length > 0) {
  console.debug("AI Safe Link content script discovered links", payload);
}
