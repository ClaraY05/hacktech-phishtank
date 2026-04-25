type AnalyzeLinksBackendRequest = {
  pageUrl: string;
  links: unknown[];
  domSignals: unknown;
  sanitizedHtmlExcerpt: string;
  contentHashHint: string;
};

export async function postAnalyzeLinks(message: AnalyzeLinksBackendRequest): Promise<unknown> {
  const response = await fetch("http://127.0.0.1:8000/analyze-links", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      page_url: message.pageUrl,
      links: message.links,
      dom_signals: message.domSignals,
      sanitized_html_excerpt: message.sanitizedHtmlExcerpt,
      content_hash_hint: message.contentHashHint,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend HTTP ${response.status}: ${text}`);
  }

  return response.json();
}
