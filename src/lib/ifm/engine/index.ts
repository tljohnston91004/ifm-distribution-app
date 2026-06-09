import type { FundingRunInput, FundingRunResult } from "../types";
import { calculateTotalFunding } from "./funding";
import { evaluateReadiness } from "./readiness";
import { decideCandidates } from "./decision";

// Core decision flow — Document 4 §2.
// 1. Validate readiness  2. Calculate core + supplemental + total funding
// 3. Rank, allocate, and assign purchase funding decisions.
export function runFunding(input: FundingRunInput): FundingRunResult {
  const readiness = evaluateReadiness(input);
  const funding = calculateTotalFunding(input);
  const decisions =
    readiness.label === "Not Ready" ? [] : decideCandidates(input, funding);

  return { readiness, funding, decisions };
}

export * from "./funding";
export * from "./readiness";
export * from "./evidence";
export * from "./cash-conversion";
export * from "./decision";
export { normalizeConfidence, worstConfidence, arInclusionFactor } from "./confidence";
