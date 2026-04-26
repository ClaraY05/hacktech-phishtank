import { type LinkAnalysisResult } from "./batchStream";
import { getHighlightTarget } from "./featureState";
import {
  RISK_ATTR,
  RISK_HIGH,
  RISK_LOW,
  RISK_MEDIUM,
  TOOLTIP_ATTR,
} from "./uiConstants";

const FALLBACK_TOOLTIP_TEXT = "PhishTank: no analysis details available.";

export function riskClass(result: LinkAnalysisResult): string {
  if (result.risk === "HIGH") return RISK_HIGH;
  if (result.risk === "MEDIUM") return RISK_MEDIUM;
  if (result.risk === "LOW") return RISK_LOW;
  // Fallback: score is 0–100 where higher = more risky.
  if (result.score >= 67) return RISK_HIGH;
  if (result.score >= 34) return RISK_MEDIUM;
  return RISK_LOW;
}

export function applyResultToLink(
  link: HTMLAnchorElement,
  result: LinkAnalysisResult,
): void {
  const risk = riskClass(result);
  const tooltipText = result.explanation || FALLBACK_TOOLTIP_TEXT;
  link.setAttribute(TOOLTIP_ATTR, tooltipText);
  link.setAttribute(RISK_ATTR, risk);
  link.removeAttribute("title");
  // Propagate risk attribute to the highlight target (heading or link itself)
  // so the CSS color selectors (.ai-safe-link-highlight[data-ai-risk="..."]) match.
  const target = getHighlightTarget(link);
  if (target && target !== link) target.setAttribute(RISK_ATTR, risk);
}
