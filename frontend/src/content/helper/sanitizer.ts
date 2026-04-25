const SUSPICIOUS_KEYWORDS = [
  "verify account",
  "urgent",
  "suspended",
  "password",
  "login",
  "bank",
  "security alert",
];

export function sanitizeHtmlForAnalysis(documentRoot: Document, maxHtmlChars: number): string {
  const clonedDocument = documentRoot.documentElement.cloneNode(true) as HTMLElement;

  clonedDocument.querySelectorAll("script, style, noscript").forEach((node) => node.remove());

  clonedDocument.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    }
  });

  clonedDocument.querySelectorAll("input").forEach((input) => {
    const typeValue = (input.getAttribute("type") || "").toLowerCase();
    if (typeValue === "password" || typeValue === "email" || typeValue === "tel") {
      input.setAttribute("value", "");
    }
  });

  return clonedDocument.outerHTML.slice(0, maxHtmlChars);
}

export function collectDomSignals(documentRoot: Document) {
  const bodyText = (documentRoot.body?.innerText || "").toLowerCase();
  const suspiciousKeywords = SUSPICIOUS_KEYWORDS.filter((keyword) => bodyText.includes(keyword));

  return {
    has_password_form: documentRoot.querySelector('input[type="password"]') !== null,
    num_forms: documentRoot.querySelectorAll("form").length,
    num_iframes: documentRoot.querySelectorAll("iframe").length,
    num_external_scripts: Array.from(documentRoot.querySelectorAll("script[src]")).filter((script) => {
      const src = script.getAttribute("src");
      return src ? !src.startsWith("/") && !src.startsWith(window.location.origin) : false;
    }).length,
    suspicious_keywords: suspiciousKeywords,
  };
}
