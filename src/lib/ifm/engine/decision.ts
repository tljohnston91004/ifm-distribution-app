import type {
  CandidateDecisionResult,
  CandidateInput,
  FundingRunInput,
  TotalFundingResult,
} from "../types";
import type {
  FundingBucket,
  FundingSource,
  FundingStatus,
  IfmDecisionLabel,
  RecommendationStatus,
} from "../enums";
import { cashConversionStatus } from "./cash-conversion";
import { evidenceRank, rsePriority, type RsePriority } from "./evidence";
import { normalizeConfidence, worstConfidence } from "./confidence";

const round2 = (n: number) => Math.round(n * 100) / 100;

const isVendorOffer = (c: CandidateInput) =>
  /vendor|offer|promo/i.test(c.sourceOfRequest) || /promo|offer/i.test(c.needReason);

function fundingBucket(c: CandidateInput, rank: number, prio: RsePriority): FundingBucket {
  if (c.urgencyLevel === "emergency" || /backorder|customer/i.test(c.needReason)) {
    return "Must-Fund / Service Protection";
  }
  if (rank >= 9 || prio === "low") return "Delayed / Watchlist";
  if (isVendorOffer(c)) return "Vendor Promo / Opportunity Buy";
  return "Normal Replenishment";
}

interface Scored {
  candidate: CandidateInput;
  rank: number;
  prio: RsePriority;
  conversion: ReturnType<typeof cashConversionStatus>;
  bucket: FundingBucket;
}

// Funding priority (Document 4 §14, ordered as in the Document 7 board). This is distinct from
// evidence support rank: scarce operating cash is directed first to the highest-velocity,
// RSE-supported, below-Min replenishment, then to confirmed service protection, then the rest.
function fundingPriorityScore(s: Scored): number {
  const c = s.candidate;
  if (c.urgencyLevel === "emergency") return 0;
  if (s.prio === "high" && c.belowMin && /replenish/i.test(c.needReason)) return 1;
  if (/backorder|customer/i.test(c.needReason)) return 2;
  if (/reorder/i.test(c.sourceOfRequest) && (c.demandSupportLevel === "moderate" || c.demandSupportLevel === "strong")) {
    return 3;
  }
  if (isVendorOffer(c) && s.prio !== "low" && s.rank <= 8) return 4;
  if (s.rank === 7) return 5; // strategic exception
  return 6 + s.rank;
}

// Base recommendation from evidence/RSE/timing, before funding capacity is applied
// (Document 4 §8, §9, §12, §13).
function baseRecommendation(s: Scored): RecommendationStatus {
  const { candidate, rank, prio, conversion } = s;
  if (candidate.urgencyLevel === "emergency") return "Emergency Review Required";
  if (rank >= 10) return "Not Recommended";
  if (prio === "low") return "Not Recommended";
  if (rank === 9) return "Hold Until More Data";
  if (prio === "review" && rank >= 8) return "Hold Until More Data";
  if (rank <= 3 && (prio === "high" || prio === "medium") && conversion !== "Mismatch") {
    return "Recommended";
  }
  return "Recommended with Caution";
}

const isPositive = (r: RecommendationStatus) =>
  r === "Recommended" || r === "Recommended with Caution" || r === "Emergency Review Required";

// Funding allocation, partial funding, holdback, decision assignment, and approval controls
// (Document 4 §14–§17, Document 7).
export function decideCandidates(
  input: FundingRunInput,
  funding: TotalFundingResult
): CandidateDecisionResult[] {
  const scored: Scored[] = input.candidates.map((candidate) => {
    const rank = evidenceRank(candidate);
    const prio = rsePriority(candidate);
    return {
      candidate,
      rank,
      prio,
      conversion: cashConversionStatus(candidate, input.settings.approvalExpirationDays),
      bucket: fundingBucket(candidate, rank, prio),
    };
  });

  scored.sort(
    (a, b) =>
      fundingPriorityScore(a) - fundingPriorityScore(b) ||
      b.candidate.estimatedTotalCost - a.candidate.estimatedTotalCost
  );

  const total = funding.totalPotentialInventoryFunding;
  const holdback =
    input.settings.emergencyHoldbackAmount > 0
      ? input.settings.emergencyHoldbackAmount
      : round2(total * input.settings.holdbackPercent);

  const core = Math.max(0, funding.core.coreAvailableInventoryFunding);
  let coreAllocatable = round2(Math.max(0, core - holdback));
  let supplementalPool = funding.supplemental.supplementalFundingCapacity;
  let holdbackPool = holdback;

  const supp = funding.supplemental;
  const supplementalApprovalRequired = input.financingSources.some(
    (f) => (f.fundingSourceType === "LOC" || f.fundingSourceType === "factoring") && f.approvalRequired
  );
  const dominantSupplemental: FundingSource =
    supp.approvedLocCapacity >= supp.approvedNetFactoring && supp.approvedLocCapacity > 0
      ? "Line of Credit"
      : supp.approvedNetFactoring > 0
      ? "Factored Receivables"
      : supp.otherApprovedFunding > 0
      ? "Vendor Extended Terms"
      : "Funding Source Unclear";
  const dominantSupplementalStatus: FundingStatus =
    dominantSupplemental === "Line of Credit"
      ? "Fundable with LOC Approval"
      : dominantSupplemental === "Factored Receivables"
      ? "Fundable with Factoring Approval"
      : dominantSupplemental === "Vendor Extended Terms"
      ? "Fundable with Vendor Terms"
      : "Funding Source Unclear";

  const results: CandidateDecisionResult[] = [];

  scored.forEach((s, index) => {
    const c = s.candidate;
    const requested = round2(c.estimatedTotalCost);
    const base = baseRecommendation(s);
    const allocationPriority = index + 1;
    const vendorOffer = isVendorOffer(c);

    // Vendor offer split (Document 4 §11): only the normal-need portion is fundable; the
    // incremental promo portion is excluded unless separately supported.
    const fundableTarget = c.vendorOffer
      ? round2(Math.min(requested, c.vendorOffer.normalNeededAmount))
      : requested;
    const offerExcluded = c.vendorOffer ? round2(requested - fundableTarget) : 0;

    let fromCore = 0;
    let fromSupp = 0;
    let fromHoldback = 0;
    if (isPositive(base) && fundableTarget > 0) {
      const mustFund = s.bucket === "Must-Fund / Service Protection";
      let need = fundableTarget;
      fromCore = Math.min(need, coreAllocatable);
      coreAllocatable = round2(coreAllocatable - fromCore);
      need = round2(need - fromCore);
      fromSupp = Math.min(need, supplementalPool);
      supplementalPool = round2(supplementalPool - fromSupp);
      need = round2(need - fromSupp);
      if (need > 0 && mustFund) {
        fromHoldback = Math.min(need, holdbackPool);
        holdbackPool = round2(holdbackPool - fromHoldback);
      }
    }
    const allocated = round2(fromCore + fromSupp + fromHoldback);
    const unfunded = round2(requested - allocated);
    const fromCoreTotal = round2(fromCore + fromHoldback);

    let fundingStatus: FundingStatus;
    let fundingSource: FundingSource;
    if (allocated <= 0) {
      fundingStatus = "Not Currently Fundable";
      fundingSource = "Not Funded";
    } else if (fromSupp > 0 && fromCoreTotal > 0) {
      fundingStatus = dominantSupplementalStatus;
      fundingSource = "Combination Funding";
    } else if (fromSupp > 0) {
      fundingStatus = dominantSupplementalStatus;
      fundingSource = dominantSupplemental;
    } else {
      fundingStatus = "Cash Fundable";
      fundingSource = "Operating Cash";
    }

    // Recommendation refined by funding: reliance on supplemental is "with caution" (Document 4 §13).
    let recommendation = base;
    if (isPositive(base) && fromSupp > 0 && base !== "Emergency Review Required") {
      recommendation = "Recommended with Caution";
    }
    if (isPositive(base) && allocated > 0 && allocated < fundableTarget) {
      recommendation = "Partially Recommended";
    }

    const overThreshold = requested >= input.settings.ownerApprovalThreshold;
    const strategic = s.rank === 7;
    const financingApprovalRequired = fromSupp > 0 && supplementalApprovalRequired;
    const ownerApprovalRequired = overThreshold || strategic;

    // Decision label (Document 4 §15).
    let decisionLabel: IfmDecisionLabel;
    if (base === "Emergency Review Required") {
      decisionLabel = "Emergency Review Required";
    } else if (base === "Not Recommended") {
      decisionLabel = vendorOffer ? "Decline Vendor Offer" : "Delay Purchase";
    } else if (base === "Hold Until More Data") {
      decisionLabel = "Hold Until More Data";
    } else if (allocated <= 0) {
      decisionLabel = "Delay Purchase";
    } else if (vendorOffer) {
      decisionLabel = offerExcluded > 0 || allocated < requested ? "Take Partial Vendor Offer" : "Take Full Vendor Offer";
    } else if (allocated < requested) {
      decisionLabel = s.conversion === "Caution" ? "Split Purchase" : "Reduce Order";
    } else {
      decisionLabel = recommendation === "Recommended" ? "Approve" : "Approve with Caution";
    }
    if (
      ownerApprovalRequired &&
      (decisionLabel === "Approve" || decisionLabel === "Approve with Caution" || decisionLabel === "Take Full Vendor Offer")
    ) {
      decisionLabel = "Owner Approval Required";
    }

    // Amount trail (Document 4 §16).
    const approvedAmount = allocated > 0 ? allocated : 0;
    const delayedAmount = decisionLabel === "Delay Purchase" ? requested : 0;
    const excludedAmount = round2(
      offerExcluded + (base === "Not Recommended" ? Math.max(0, unfunded - offerExcluded) : 0)
    );

    const confidenceLevel = worstConfidence([
      normalizeConfidence(c.dataConfidence),
      funding.core.fundingConfidence,
    ]);

    const reasonParts = [
      `Evidence rank ${s.rank}/10`,
      `RSE priority ${s.prio}`,
      `cash conversion ${s.conversion}`,
      fundingStatus,
    ];
    if (offerExcluded > 0) reasonParts.push(`vendor offer incremental ${offerExcluded} excluded`);
    if (ownerApprovalRequired) {
      reasonParts.push(
        overThreshold
          ? `at/above owner approval threshold (${input.settings.ownerApprovalThreshold})`
          : "strategic exception"
      );
    }
    if (financingApprovalRequired) reasonParts.push("supplemental funding approval required");

    results.push({
      candidateId: c.id,
      vendorName: c.vendorName,
      requestedAmount: requested,
      evidenceRank: s.rank,
      rsePriority: s.prio,
      cashConversion: s.conversion,
      fundingBucket: s.bucket,
      allocationPriority,
      allocatedAmount: allocated,
      unfundedAmount: unfunded,
      fundingSource,
      fundingStatus,
      recommendationStatus: recommendation,
      decisionLabel,
      approvedAmount,
      delayedAmount,
      excludedAmount,
      ownerApprovalRequired,
      financingApprovalRequired,
      decisionReason: reasonParts.join("; ") + ".",
      confidenceLevel,
    });
  });

  // Vendor concentration pass (Document 4 §14; Document 7 measures share of core available
  // funding). This raises a risk note and is surfaced as a warning banner; it does not by itself
  // force owner approval (high-dollar/financing/strategic gates handle that).
  const concentrationBase = Math.max(1, core);
  const perVendor = new Map<string, number>();
  for (const r of results) {
    perVendor.set(r.vendorName, (perVendor.get(r.vendorName) ?? 0) + r.allocatedAmount);
  }
  for (const r of results) {
    const share = (perVendor.get(r.vendorName) ?? 0) / concentrationBase;
    if (share > input.settings.vendorConcentrationLimit && r.allocatedAmount > 0) {
      if (!/vendor concentration/i.test(r.decisionReason)) {
        r.decisionReason = r.decisionReason.replace(/\.$/, "") + "; vendor concentration risk flagged.";
      }
    }
  }

  return results;
}
