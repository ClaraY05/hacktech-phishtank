export type LinkAnalysisResult = {
  url: string;
  risk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  score: number;
  explanation: string;
  key_signals: string[];
  error?: string;
};

export function scoreToRating(score: number): number {
  return Math.max(1, Math.min(10, 10 - Math.round(score / 11)));
}

export async function streamBatchAnalysis(
  payload: {
    pageUrl: string;
    links: { url: string; text: string }[];
    domSignals: object;
    sanitizedHtmlExcerpt: string;
    contentHashHint: string;
  },
  onResult: (result: LinkAnalysisResult) => void,
): Promise<void> {
  const response = await fetch("http://127.0.0.1:8000/send-batch-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      page_url: payload.pageUrl,
      links: payload.links,
      dom_signals: payload.domSignals,
      sanitized_html_excerpt: payload.sanitizedHtmlExcerpt,
      content_hash_hint: payload.contentHashHint,
    }),
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
          onResult(data as unknown as LinkAnalysisResult);
        }
      } catch {
        // malformed SSE line, skip
      }
    }
  }
}
