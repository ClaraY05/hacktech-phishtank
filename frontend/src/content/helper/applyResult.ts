import { type LinkAnalysisResult } from "./batchStream";
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
  const tooltipText = result.explanation || FALLBACK_TOOLTIP_TEXT;
  link.setAttribute(TOOLTIP_ATTR, tooltipText);
  link.setAttribute(RISK_ATTR, riskClass(result));
  link.removeAttribute("title");
}
