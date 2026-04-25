import type { LinkItem } from "./linkScanner";

export type AnalyzeLinksMessage = {
  type: "ANALYZE_LINKS";
  pageUrl: string;
  links: LinkItem[];
  domSignals: {
    has_password_form: boolean;
    num_forms: number;
    num_iframes: number;
    num_external_scripts: number;
    suspicious_keywords: string[];
  };
  sanitizedHtmlExcerpt: string;
  contentHashHint: string;
};

export function buildAnalyzePayload(input: {
  pageUrl: string;
  links: LinkItem[];
  domSignals: AnalyzeLinksMessage["domSignals"];
  sanitizedHtmlExcerpt: string;
}): AnalyzeLinksMessage {
  return {
    type: "ANALYZE_LINKS",
    pageUrl: input.pageUrl,
    links: input.links,
    domSignals: input.domSignals,
    sanitizedHtmlExcerpt: input.sanitizedHtmlExcerpt,
    contentHashHint: `${window.location.hostname}:${input.links.length}:${input.sanitizedHtmlExcerpt.length}`,
  };
}
