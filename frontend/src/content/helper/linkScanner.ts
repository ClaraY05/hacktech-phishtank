export type LinkItem = {
  url: string;
  text: string;
};

export function discoverLinks(documentRoot: Document): HTMLAnchorElement[] {
  return Array.from(documentRoot.querySelectorAll<HTMLAnchorElement>("a[href]"));
}

export function buildLinkPayload(links: HTMLAnchorElement[], maxLinks: number): LinkItem[] {
  return links.slice(0, maxLinks).map((link) => ({
    url: link.href,
    text: (link.textContent || "").trim(),
  }));
}
