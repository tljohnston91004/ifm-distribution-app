import type {
  ApItemInput,
  ArItemInput,
  CashPositionInput,
  CoreFundingResult,
  FinancingInput,
  FundingRunInput,
  OpenPoInput,
  RequiredOutflowInput,
  SupplementalFundingResult,
  TotalFundingResult,
} from "../types";
import { arInclusionFactor, normalizeConfidence, worstConfidence } from "./confidence";

const round2 = (n: number) => Math.round(n * 100) / 100;

// Open PO exposure treatment — Document 4 §5. Returns the committed cash exposure to subtract
// from core funding for a single PO. Draft / candidate / billed / closed contribute nothing
// (billed is already captured in AP; draft is a candidate, not committed exposure).
export function openPoExposure(po: OpenPoInput): number {
  switch (po.commitmentStatus) {
    case "Purchase Candidate Only":
    case "Draft / Not Sent":
    case "Billed / AP Created":
    case "Closed":
      return 0;
    case "Sent but Changeable":
      // Document 7 treats "Sent but Changeable" as committed exposure to include (with a review
      // flag), not a partial fraction. Include the full exposure; the review flag is surfaced as a banner.
      return po.cashExposureAmount;
    case "Vendor Confirmed":
    case "Partially Shipped":
    case "Fully Shipped":
    case "Received but Not Billed":
      return po.cashExposureAmount;
    default:
      return po.cashExposureAmount;
  }
}

function inWindow(date: Date, windowEnd: Date): boolean {
  return date.getTime() <= windowEnd.getTime();
}

// Expected inflows included in core funding (Document 4 §4). Excludes factored AR (no double
// counting, §7) and AR not flagged for core funding. Each amount is scaled by its confidence factor.
function includedInflows(arItems: ArItemInput[], input: FundingRunInput): number {
  return arItems.reduce((sum, ar) => {
    if (!ar.includedInCoreFunding || ar.factoredFlag) return sum;
    if (!inWindow(ar.expectedCollectionDate, input.fundingWindowEnd)) return sum;
    const conf = normalizeConfidence(String(ar.collectionConfidence));
    return sum + ar.expectedAmount * arInclusionFactor(conf, input.settings);
  }, 0);
}

// Required outflows due within the funding window (Document 4 §4). Flexible outflows that can be
// delayed are not subtracted; must-pay and non-delayable obligations are.
function requiredOutflowsTotal(outflows: RequiredOutflowInput[], windowEnd: Date): number {
  return outflows.reduce((sum, o) => {
    if (!inWindow(o.dueDate, windowEnd)) return sum;
    if (o.requiredStatus === "flexible" && o.canDelay === true) return sum;
    return sum + o.amount;
  }, 0);
}

// AP pressure — AP due within the funding window, plus past-due and critical-vendor AP (Document 4 §4).
function apPressureTotal(apItems: ApItemInput[], windowEnd: Date): number {
  return apItems.reduce((sum, ap) => {
    const due = inWindow(ap.dueDate, windowEnd);
    if (due || ap.criticalVendorFlag) return sum + ap.amountDue;
    return sum;
  }, 0);
}

function cashOnHandTotal(cashPositions: CashPositionInput[]): number {
  return cashPositions.reduce((sum, c) => {
    const usable = c.availableOperatingCash ?? c.cashOnHand;
    return sum + usable;
  }, 0);
}

// Layer 1 — Core Operating Cash Funding (Document 4 §4).
export function calculateCoreFunding(input: FundingRunInput): CoreFundingResult {
  const cashOnHand = round2(cashOnHandTotal(input.cashPositions));
  const confidentExpectedInflows = round2(includedInflows(input.arItems, input));
  const protectedCashReserve = input.settings.protectedCashReserve;
  const requiredOutflows = round2(requiredOutflowsTotal(input.requiredOutflows, input.fundingWindowEnd));
  const apPressure = round2(apPressureTotal(input.apItems, input.fundingWindowEnd));
  const openPoExposureTotal = round2(
    input.openPurchaseOrders.reduce((sum, po) => sum + openPoExposure(po), 0)
  );
  const manualCashAdditions = input.manualCashAdditions ?? 0;
  const manualCashReductions = input.manualCashReductions ?? 0;

  const core = round2(
    cashOnHand +
      confidentExpectedInflows -
      protectedCashReserve -
      requiredOutflows -
      apPressure -
      openPoExposureTotal -
      manualCashReductions +
      manualCashAdditions
  );

  const fundingConfidence = worstConfidence(
    input.cashPositions.map((c) => normalizeConfidence(c.dataConfidence))
  );

  return {
    cashOnHand,
    confidentExpectedInflows,
    protectedCashReserve,
    requiredOutflowsTotal: requiredOutflows,
    apPressureTotal: apPressure,
    openPoExposureTotal,
    manualCashAdditions,
    manualCashReductions,
    coreAvailableInventoryFunding: core,
    negativeWarning: core < 0,
    fundingConfidence,
  };
}

// Available LOC capacity for inventory (Document 4 §6).
function approvedLocCapacity(financing: FinancingInput[]): number {
  return financing.reduce((sum, f) => {
    if (f.fundingSourceType !== "LOC" || !f.loc) return sum;
    const available =
      f.loc.borrowingBaseLimit != null
        ? Math.min(f.loc.remainingAvailability, f.loc.borrowingBaseLimit)
        : f.loc.remainingAvailability;
    const drawLimit = f.loc.managementDrawLimit ?? f.approvedForInventoryAmount ?? available;
    return sum + Math.max(0, Math.min(available, drawLimit));
  }, 0);
}

// Net factoring proceeds (Document 4 §6): eligible AR × advance rate − fee − holdback.
function approvedNetFactoring(financing: FinancingInput[]): number {
  return financing.reduce((sum, f) => {
    if (f.fundingSourceType !== "factoring" || !f.factoring) return sum;
    const net =
      f.factoring.eligibleArAmount * f.factoring.advanceRate -
      f.factoring.factoringFee -
      (f.factoring.reserveHoldback ?? 0);
    return sum + Math.max(0, net);
  }, 0);
}

function otherApprovedFunding(financing: FinancingInput[]): number {
  return financing.reduce((sum, f) => {
    if (f.fundingSourceType !== "other") return sum;
    return sum + Math.max(0, f.approvedForInventoryAmount);
  }, 0);
}

// Layer 2 — Supplemental Funding Capacity (Document 4 §6).
export function calculateSupplementalFunding(input: FundingRunInput): SupplementalFundingResult {
  const loc = round2(approvedLocCapacity(input.financingSources));
  const factoring = round2(approvedNetFactoring(input.financingSources));
  const other = round2(otherApprovedFunding(input.financingSources));
  return {
    approvedLocCapacity: loc,
    approvedNetFactoring: factoring,
    otherApprovedFunding: other,
    supplementalFundingCapacity: round2(loc + factoring + other),
    fundingConfidence: input.financingSources.length === 0 ? "Insufficient Data" : "Medium Confidence",
  };
}

// Layer 3 — Total Potential Inventory Funding (Document 4 §6).
export function calculateTotalFunding(input: FundingRunInput): TotalFundingResult {
  const core = calculateCoreFunding(input);
  const supplemental = calculateSupplementalFunding(input);
  return {
    core,
    supplemental,
    totalPotentialInventoryFunding: round2(
      Math.max(0, core.coreAvailableInventoryFunding) + supplemental.supplementalFundingCapacity
    ),
  };
}
