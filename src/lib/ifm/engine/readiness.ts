import type { FundingRunInput, ReadinessResult } from "../types";
import { normalizeConfidence } from "./confidence";

// Run readiness — Document 4 §3, against the minimum viable run data in Document 3 §6.
// "Blank or missing data must not be treated as zero unless confirmed none exist" (hard rule).
export function evaluateReadiness(input: FundingRunInput): ReadinessResult {
  const confirmed = input.confirmedNone ?? {};
  const blockingReasons: string[] = [];
  const limitations: string[] = [];

  // Core cash is required and cannot be assumed zero.
  if (input.cashPositions.length === 0 && !confirmed.cash) {
    blockingReasons.push("Cash on hand is missing and not confirmed as none.");
  }

  // Funding window must be valid.
  if (input.fundingWindowEnd.getTime() < input.fundingWindowStart.getTime()) {
    blockingReasons.push("Funding window end is before its start.");
  }

  // IFM needs something to review.
  if (
    input.candidates.length === 0 &&
    input.openPurchaseOrders.length === 0 &&
    !confirmed.candidates
  ) {
    blockingReasons.push("No purchase candidate or open PO to review.");
  }

  // Required-or-confirmed-none domains: missing without confirmation is a limitation
  // (it constrains decision quality but does not block the core run on its own).
  if (input.requiredOutflows.length === 0 && !confirmed.outflows) {
    limitations.push("Required outflows missing and not confirmed as none.");
  }
  if (input.apItems.length === 0 && !confirmed.ap) {
    limitations.push("AP / bills due missing and not confirmed as none.");
  }
  if (input.openPurchaseOrders.length === 0 && !confirmed.openPo) {
    limitations.push("Open PO exposure missing and not confirmed as none.");
  }

  // Low-confidence cash reduces overall confidence.
  for (const c of input.cashPositions) {
    const conf = normalizeConfidence(c.dataConfidence);
    if (conf === "Low Confidence" || conf === "Insufficient Data") {
      limitations.push("Cash position has low or insufficient confidence.");
      break;
    }
  }

  // Candidates with insufficient data are flagged but do not block the whole run.
  const weakCandidates = input.candidates.filter(
    (cand) => normalizeConfidence(cand.dataConfidence) === "Insufficient Data"
  );
  if (weakCandidates.length > 0) {
    limitations.push(
      `${weakCandidates.length} purchase candidate(s) have insufficient data confidence.`
    );
  }

  if (blockingReasons.length > 0) {
    return { label: "Not Ready", blockingReasons, limitations };
  }
  if (limitations.length > 0) {
    return { label: "Ready with Limitations", blockingReasons, limitations };
  }
  return { label: "Ready", blockingReasons, limitations };
}
