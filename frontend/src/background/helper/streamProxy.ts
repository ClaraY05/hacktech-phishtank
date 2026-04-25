// Streams /send-batch-links from the SW context (chrome-extension:// origin)
// so the content script can avoid Chrome's Local Network Access block on
// page-origin -> 127.0.0.1 fetches.

export type StreamPayload = {
  pageUrl: string;
  links: { url: string; text: string }[];
  domSignals: object;
  sanitizedHtmlExcerpt: string;
  contentHashHint: string;
};

const BACKEND_URL = "http://127.0.0.1:8000/send-batch-links";

export async function streamBatchToCallback(
  payload: StreamPayload,
  onResult: (result: Record<string, unknown>) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      page_url: payload.pageUrl,
      links: payload.links,
      dom_signals: payload.domSignals,
      sanitized_html_excerpt: payload.sanitizedHtmlExcerpt,
      content_hash_hint: payload.contentHashHint,
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend HTTP ${response.status}: ${text}`);
  }

  if (!response.body) {
    throw new Error("No response body from backend.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      try {
        const data = JSON.parse(raw) as Record<string, unknown>;
        if (!("done" in data)) {
          onResult(data);
        }
      } catch {
        // malformed SSE line, skip
      }
    }
  }
}
