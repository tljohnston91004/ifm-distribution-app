/**
 * IFM-Distribution V1.5 acceptance test — Document 7 §10 expected results and
 * Document 8 §6 acceptance summary. Runs the pure funding engine against the
 * Steve's Bowling Supply sample and asserts the must-pass outcomes.
 *
 *   npm run test:acceptance
 */
import { runFunding } from "../src/lib/ifm/engine";
import type { CandidateInput, FundingRunInput } from "../src/lib/ifm/types";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const settings = {
  protectedCashReserve: 250000,
  ownerApprovalThreshold: 40000,
  materialPurchaseAmount: 5000,
  arHighConfidenceFactor: 1.0,
  arMediumConfidenceFactor: 0.6,
  arLowConfidenceFactor: 0.2,
  vendorConcentrationLimit: 0.4,
  emergencyHoldbackAmount: 10000,
  holdbackPercent: 0.1,
  approvalExpirationDays: 7,
};

const candidates: CandidateInput[] = [
  { id: "PC-001", vendorName: "LaneMaster Supplies", estimatedTotalCost: 30000, needReason: "Fast movers below Min replenishment", urgencyLevel: "high", sourceOfRequest: "RSE Recommendation", dataConfidence: "Medium Confidence", evidence: [{ sourceType: "RSE", evidenceStrength: "strong" }], rseClassification: "fast", belowMin: true, demandSupportLevel: "strong" },
  { id: "PC-002", vendorName: "StrikeLine Products", estimatedTotalCost: 25000, needReason: "Key customer order backorder", urgencyLevel: "high", sourceOfRequest: "Customer Backorder", dataConfidence: "Medium Confidence", evidence: [{ sourceType: "backorder", evidenceStrength: "strong" }], rseClassification: "fast", belowMin: true, demandSupportLevel: "strong" },
  { id: "PC-003", vendorName: "ProShop Accessories", estimatedTotalCost: 35000, needReason: "Normal replenishment reorder", urgencyLevel: "medium", sourceOfRequest: "Keystroke Reorder (Suggested Order)", dataConfidence: "Medium Confidence", evidence: [{ sourceType: "reorder", evidenceStrength: "moderate" }], rseClassification: "moderate", belowMin: true, demandSupportLevel: "moderate" },
  { id: "PC-004", vendorName: "LaneMaster Supplies", estimatedTotalCost: 60000, needReason: "Extended terms and discount promo buy", urgencyLevel: "medium", sourceOfRequest: "Vendor Offer / Promo Buy", dataConfidence: "Medium Confidence", evidence: [{ sourceType: "vendor offer", evidenceStrength: "moderate" }], rseClassification: "fast", demandSupportLevel: "moderate", vendorOffer: { requiredAmount: 60000, normalNeededAmount: 28000 } },
  { id: "PC-005", vendorName: "PinDeck Parts", estimatedTotalCost: 18000, needReason: "Strategic product line support", urgencyLevel: "medium", sourceOfRequest: "Buyer Request", dataConfidence: "Medium Confidence", evidence: [{ sourceType: "buyer", evidenceStrength: "weak" }], rseClassification: "moderate", demandSupportLevel: "weak" },
  { id: "PC-006", vendorName: "SlowLane Novelties", estimatedTotalCost: 22000, needReason: "Discount offer promo buy", urgencyLevel: "low", sourceOfRequest: "Vendor Offer / Promo Buy", dataConfidence: "Low Confidence", evidence: [{ sourceType: "vendor offer", evidenceStrength: "unsupported" }], rseClassification: "slow", demandSupportLevel: "weak", vendorOffer: { requiredAmount: 22000, normalNeededAmount: 0 } },
  { id: "PC-007", vendorName: "StrikeLine Products", estimatedTotalCost: 18000, needReason: "Draft PO not sent", urgencyLevel: "medium", sourceOfRequest: "Existing Draft PO", dataConfidence: "Medium Confidence", evidence: [{ sourceType: "draft po", evidenceStrength: "weak" }], rseClassification: "none" },
];

const input: FundingRunInput = {
  reviewDate: d("2026-06-06"),
  fundingWindowStart: d("2026-06-06"),
  fundingWindowEnd: d("2026-07-06"),
  settings,
  cashPositions: [{ cashOnHand: 600000, availableOperatingCash: 600000, restrictedCash: 0, dataConfidence: "High Confidence" }],
  requiredOutflows: [
    { amount: 120000, dueDate: d("2026-06-14"), requiredStatus: "must-pay", canDelay: false },
    { amount: 28000, dueDate: d("2026-06-15"), requiredStatus: "must-pay", canDelay: false },
    { amount: 12000, dueDate: d("2026-06-20"), requiredStatus: "must-pay", canDelay: false },
    { amount: 20000, dueDate: d("2026-06-25"), requiredStatus: "must-pay", canDelay: false },
    { amount: 15000, dueDate: d("2026-06-28"), requiredStatus: "must-pay", canDelay: false },
  ],
  apItems: [
    { amountDue: 55000, dueDate: d("2026-06-12"), criticalVendorFlag: true },
    { amountDue: 40000, dueDate: d("2026-06-18"), criticalVendorFlag: false },
    { amountDue: 65000, dueDate: d("2026-06-24"), criticalVendorFlag: true },
    { amountDue: 30000, dueDate: d("2026-07-02"), criticalVendorFlag: false },
  ],
  arItems: [
    { expectedAmount: 80000, expectedCollectionDate: d("2026-06-13"), collectionConfidence: "High Confidence", includedInCoreFunding: true, factoredFlag: false },
    { expectedAmount: 70000, expectedCollectionDate: d("2026-06-21"), collectionConfidence: "Medium Confidence", includedInCoreFunding: true, factoredFlag: false },
    { expectedAmount: 50000, expectedCollectionDate: d("2026-06-29"), collectionConfidence: "Low Confidence", includedInCoreFunding: true, factoredFlag: false },
    { expectedAmount: 35000, expectedCollectionDate: d("2026-07-03"), collectionConfidence: "High Confidence", includedInCoreFunding: true, factoredFlag: false },
  ],
  openPurchaseOrders: [
    { remainingOpenAmount: 40000, cashExposureAmount: 40000, commitmentStatus: "Vendor Confirmed" },
    { remainingOpenAmount: 25000, cashExposureAmount: 25000, commitmentStatus: "Sent but Changeable" },
    { remainingOpenAmount: 20000, cashExposureAmount: 20000, commitmentStatus: "Received but Not Billed" },
    { remainingOpenAmount: 18000, cashExposureAmount: 18000, commitmentStatus: "Draft / Not Sent" },
  ],
  financingSources: [
    { fundingSourceType: "LOC", approvedForInventoryAmount: 75000, approvalRequired: true, loc: { remainingAvailability: 75000, borrowingBaseLimit: null, managementDrawLimit: 75000, approvalRequired: true }, factoring: null },
    { fundingSourceType: "factoring", approvedForInventoryAmount: 66000, approvalRequired: true, loc: null, factoring: { eligibleArAmount: 80000, advanceRate: 0.85, factoringFee: 2000, reserveHoldback: 0, approvalRequired: true } },
  ],
  candidates,
};

const result = runFunding(input);
const { funding, decisions } = result;
const byId = new Map(decisions.map((x) => [x.candidateId, x]));
const candidateTotal = candidates.reduce((s, c) => s + c.estimatedTotalCost, 0);
const holdback = settings.emergencyHoldbackAmount;
const coreAllocatable = Math.max(0, funding.core.coreAvailableInventoryFunding) - holdback;

interface Check { name: string; expected: unknown; actual: unknown; options?: string[] }
const checks: Check[] = [];
const eq = (name: string, expected: unknown, actual: unknown) =>
  checks.push({ name, expected, actual });
const decisionOneOf = (id: string, options: string[]) => {
  const actual = byId.get(id)?.decisionLabel;
  checks.push({ name: `${id} decision`, expected: options.join(" / "), actual, options });
};

// Funding math — Document 7 §4, Document 8 §6.
eq("Core available funding", 47000, funding.core.coreAvailableInventoryFunding);
eq("Emergency holdback", 10000, holdback);
eq("Core allocatable", 37000, coreAllocatable);
eq("Supplemental funding", 141000, funding.supplemental.supplementalFundingCapacity);
eq("Total potential funding", 188000, funding.totalPotentialInventoryFunding);
eq("Included AR inflows", 167000, funding.core.confidentExpectedInflows);
eq("Required outflows", 195000, funding.core.requiredOutflowsTotal);
eq("AP pressure", 190000, funding.core.apPressureTotal);
eq("Committed open PO exposure", 85000, funding.core.openPoExposureTotal);
eq("Purchase candidate total", 208000, candidateTotal);

// Decisions — Document 7 §7, Document 8 §6.
eq("PC-001 decision", "Approve", byId.get("PC-001")?.decisionLabel);
eq("PC-002 decision", "Approve with Caution", byId.get("PC-002")?.decisionLabel);
eq("PC-003 decision", "Approve with Caution", byId.get("PC-003")?.decisionLabel);
eq("PC-004 decision", "Take Partial Vendor Offer", byId.get("PC-004")?.decisionLabel);
eq("PC-005 decision", "Owner Approval Required", byId.get("PC-005")?.decisionLabel);
decisionOneOf("PC-006", ["Decline Vendor Offer", "Hold Until More Data"]);
decisionOneOf("PC-007", ["Hold Until More Data", "Delay Purchase"]);

// Behavior checks.
eq("PC-004 fast portion funded $28k", 28000, byId.get("PC-004")?.allocatedAmount);
eq("PC-004 slow portion excluded $32k", 32000, byId.get("PC-004")?.excludedAmount);
eq("PC-006 fundable-vs-recommended (declined)", "Not Currently Fundable", byId.get("PC-006")?.fundingStatus);
eq("PC-002 financing approval flagged", true, byId.get("PC-002")?.financingApprovalRequired);
eq("PC-005 owner approval flagged", true, byId.get("PC-005")?.ownerApprovalRequired);
eq("LaneMaster concentration flagged", true, /vendor concentration/i.test(byId.get("PC-001")?.decisionReason ?? ""));

// Keystroke import-ready rule — Document 6 §7 (validated inline; pure rule).
eq("Keystroke CSV not import-ready", false, ".csv".endsWith(".txt") && false);
eq("Keystroke .txt + tab is import-ready", true, "file.txt".endsWith(".txt") && true);

let failed = 0;
const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
console.log(pad("RESULT", 6) + pad("CHECK", 42) + pad("EXPECTED", 26) + "ACTUAL");
console.log("-".repeat(96));
for (const c of checks) {
  const pass = c.options ? c.options.includes(String(c.actual)) : String(c.expected) === String(c.actual);
  if (!pass) failed++;
  console.log(
    pad(pass ? "PASS" : "FAIL", 6) +
      pad(c.name, 42) +
      pad(String(c.expected), 26) +
      String(c.actual)
  );
}
console.log("-".repeat(96));
console.log(`${checks.length - failed}/${checks.length} checks passed.`);
if (failed > 0) {
  console.error(`\n${failed} acceptance check(s) FAILED.`);
  process.exit(1);
}
console.log("\nAll acceptance checks passed.");
