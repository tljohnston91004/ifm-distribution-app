import { prisma } from "@/lib/db";

export type ExportType = "decision" | "funding-summary" | "allocation" | "data-gap" | "vendor-offer";
export type ExportFormat = "csv" | "tsv";

export interface ExportFile {
  fileName: string;
  mime: string;
  content: string;
  // Keystroke import-ready label is only ever applied to validated tab-delimited .txt files.
  keystrokeImportReady: boolean;
}

const escapeCsv = (value: unknown): string => {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

function serialize(rows: Array<Record<string, unknown>>, columns: string[], format: ExportFormat): string {
  const sep = format === "tsv" ? "\t" : ",";
  const enc = format === "tsv" ? (v: unknown) => String(v ?? "").replace(/\t|\n/g, " ") : escapeCsv;
  const header = columns.join(sep);
  const body = rows.map((r) => columns.map((c) => enc(r[c])).join(sep));
  return [header, ...body].join("\n");
}

const fmtDate = (date: Date | null | undefined): string =>
  date ? date.toISOString().slice(0, 10) : "";

// Purchase Funding Decision Export — Document 6 §6.
async function buildDecisionRows(runId: string) {
  const run = await prisma.ifmRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      purchaseDecisions: { include: { candidate: true } },
      fundingAllocations: true,
    },
  });
  const allocByCandidate = new Map(run.fundingAllocations.map((a) => [a.purchaseCandidateId, a]));
  return run.purchaseDecisions.map((dn) => {
    const c = dn.candidate;
    const alloc = allocByCandidate.get(dn.purchaseCandidateId);
    return {
      ifm_run_id: run.id,
      review_date: fmtDate(run.reviewDate),
      funding_window_start: fmtDate(run.fundingWindowStart),
      funding_window_end: fmtDate(run.fundingWindowEnd),
      purchase_candidate_id: c.id,
      vendor_name: c.vendorName,
      vendor_code: "",
      item_or_category: c.skuOrItemId ?? c.categoryOrGroup ?? "",
      purchase_source: c.sourceOfRequest,
      need_reason: c.needReason,
      requested_amount: c.estimatedTotalCost,
      recommended_funded_amount: alloc?.allocatedAmount ?? dn.approvedAmount,
      approved_funding_amount: "",
      actual_ordered_amount: "",
      received_amount: "",
      ap_billed_amount: "",
      paid_amount: "",
      unfunded_amount: alloc?.unfundedAmount ?? 0,
      delayed_amount: dn.delayedAmount,
      excluded_amount: dn.excludedAmount,
      funding_source: alloc?.fundingSource ?? "Not Funded",
      funding_status: dn.fundingStatus,
      recommendation_status: dn.recommendationStatus,
      ifm_decision_label: dn.systemDecisionLabel,
      approval_required: dn.ownerApprovalRequired || dn.financingApprovalRequired ? "Yes" : "No",
      owner_approval_required: dn.ownerApprovalRequired ? "Yes" : "No",
      financing_approval_required: dn.financingApprovalRequired ? "Yes" : "No",
      confidence_level: dn.confidenceLevel,
      decision_reason: dn.decisionReason,
      next_action: "Buyer to act outside IFM after approval",
      next_action_owner: dn.ownerApprovalRequired ? "Owner" : "Reviewer",
      export_use_status: "Internal Reviewer Only",
      export_visibility: "Internal Reviewer Only",
    };
  });
}

const DECISION_COLUMNS = [
  "ifm_run_id", "review_date", "funding_window_start", "funding_window_end", "purchase_candidate_id",
  "vendor_name", "vendor_code", "item_or_category", "purchase_source", "need_reason", "requested_amount",
  "recommended_funded_amount", "approved_funding_amount", "actual_ordered_amount", "received_amount",
  "ap_billed_amount", "paid_amount", "unfunded_amount", "delayed_amount", "excluded_amount", "funding_source",
  "funding_status", "recommendation_status", "ifm_decision_label", "approval_required", "owner_approval_required",
  "financing_approval_required", "confidence_level", "decision_reason", "next_action", "next_action_owner",
  "export_use_status", "export_visibility",
];

// Funding Summary Export — Document 6 §6.
async function buildFundingSummaryRows(runId: string) {
  const run = await prisma.ifmRun.findUniqueOrThrow({
    where: { id: runId },
    include: { fundingCalculation: true, supplementalCalc: true },
  });
  const fc = run.fundingCalculation;
  return [
    {
      ifm_run_id: run.id,
      review_date: fmtDate(run.reviewDate),
      funding_window_start: fmtDate(run.fundingWindowStart),
      funding_window_end: fmtDate(run.fundingWindowEnd),
      cash_on_hand: fc?.cashOnHand ?? "",
      protected_cash_reserve: fc?.protectedCashReserve ?? "",
      required_outflows_total: fc?.requiredOutflowsTotal ?? "",
      ap_pressure_total: fc?.apPressureTotal ?? "",
      open_po_exposure_total: fc?.openPoExposureTotal ?? "",
      expected_inflows_included: fc?.confidentExpectedInflows ?? "",
      core_available_inventory_funding: fc?.coreAvailableInventoryFunding ?? "",
      supplemental_funding_capacity: fc?.supplementalFundingCapacity ?? "",
      total_potential_inventory_funding: fc?.totalPotentialInventoryFunding ?? "",
      emergency_service_holdback: "",
      funding_confidence: fc?.fundingConfidence ?? "",
      limitation_note: "",
      calculation_version: fc?.calculationVersion ?? 1,
      locked_flag: fc?.lockedFlag ? "Yes" : "No",
    },
  ];
}

const FUNDING_SUMMARY_COLUMNS = [
  "ifm_run_id", "review_date", "funding_window_start", "funding_window_end", "cash_on_hand",
  "protected_cash_reserve", "required_outflows_total", "ap_pressure_total", "open_po_exposure_total",
  "expected_inflows_included", "core_available_inventory_funding", "supplemental_funding_capacity",
  "total_potential_inventory_funding", "emergency_service_holdback", "funding_confidence", "limitation_note",
  "calculation_version", "locked_flag",
];

// Funding Allocation Export — Document 6 §6.
async function buildAllocationRows(runId: string) {
  const allocations = await prisma.fundingAllocation.findMany({ where: { ifmRunId: runId } });
  return allocations.map((a) => ({
    ifm_run_id: a.ifmRunId,
    allocation_id: a.id,
    purchase_candidate_id: a.purchaseCandidateId,
    vendor_name: "",
    funding_bucket: a.fundingBucket,
    requested_amount: a.requestedAmount,
    allocated_amount: a.allocatedAmount,
    unfunded_amount: a.unfundedAmount,
    allocation_priority: a.allocationPriority,
    funding_source: a.fundingSource,
    allocation_reason: a.allocationReason,
    confidence_level: a.confidenceLevel,
    approval_required: "",
  }));
}

const ALLOCATION_COLUMNS = [
  "ifm_run_id", "allocation_id", "purchase_candidate_id", "vendor_name", "funding_bucket", "requested_amount",
  "allocated_amount", "unfunded_amount", "allocation_priority", "funding_source", "allocation_reason",
  "confidence_level", "approval_required",
];

// Data Gap Export — Document 6 §6.
async function buildDataGapRows(runId: string) {
  const gaps = await prisma.dataGap.findMany({ where: { ifmRunId: runId } });
  return gaps.map((g) => ({
    ifm_run_id: g.ifmRunId,
    data_gap_id: g.id,
    affected_domain: g.affectedDomain,
    affected_decision: g.affectedDecision ?? "",
    gap_description: g.gapDescription,
    severity: g.severity,
    blocking_status: g.blockingStatus,
    required_fix: g.requiredFix,
    owner: g.owner ?? "",
    due_date: "",
    status: g.status,
    confidence_impact: g.confidenceImpact,
    customer_visible_flag: "No",
  }));
}

const DATA_GAP_COLUMNS = [
  "ifm_run_id", "data_gap_id", "affected_domain", "affected_decision", "gap_description", "severity",
  "blocking_status", "required_fix", "owner", "due_date", "status", "confidence_impact", "customer_visible_flag",
];

// Vendor Offer / Promo-Buy Export — Document 6 §6.
async function buildVendorOfferRows(runId: string) {
  const offers = await prisma.vendorOffer.findMany({
    where: { ifmRunId: runId },
    include: {
      candidate: {
        include: {
          decisions: true,
          allocations: true,
        },
      },
    },
  });
  return offers.map((o) => {
    const dn = o.candidate?.decisions[0];
    const alloc = o.candidate?.allocations[0];
    return {
      ifm_run_id: o.ifmRunId,
      vendor_offer_id: o.id,
      vendor_name: o.vendorName,
      offer_type: o.offerType,
      offer_expiration_date: fmtDate(o.offerExpirationDate),
      required_order_amount: o.requiredOrderAmount,
      normal_needed_purchase_amount: o.normalNeededPurchaseAmount,
      incremental_purchase_amount: o.incrementalPurchaseAmount,
      discount_terms_freight_benefit: o.discountTermsFreightBenefit ?? "",
      estimated_financing_need: alloc?.fundingSource?.includes("Cash") ? 0 : alloc?.allocatedAmount ?? "",
      estimated_inventory_burden: o.incrementalPurchaseAmount,
      rse_classification_mix: o.rseClassificationMix ?? "",
      recommended_funded_amount: alloc?.allocatedAmount ?? 0,
      recommended_excluded_amount: dn?.excludedAmount ?? o.incrementalPurchaseAmount,
      funding_source: alloc?.fundingSource ?? "Not Funded",
      recommendation: dn?.recommendationStatus ?? "",
      approval_required: dn?.ownerApprovalRequired ? "Owner" : dn?.financingApprovalRequired ? "Financing" : "Reviewer",
      decision_reason: dn?.decisionReason ?? "",
    };
  });
}

const VENDOR_OFFER_COLUMNS = [
  "ifm_run_id", "vendor_offer_id", "vendor_name", "offer_type", "offer_expiration_date", "required_order_amount",
  "normal_needed_purchase_amount", "incremental_purchase_amount", "discount_terms_freight_benefit",
  "estimated_financing_need", "estimated_inventory_burden", "rse_classification_mix", "recommended_funded_amount",
  "recommended_excluded_amount", "funding_source", "recommendation", "approval_required", "decision_reason",
];

const CONFIG: Record<ExportType, { columns: string[]; rows: (runId: string) => Promise<Array<Record<string, unknown>>>; label: string }> = {
  decision: { columns: DECISION_COLUMNS, rows: buildDecisionRows, label: "PurchaseFundingDecision" },
  "funding-summary": { columns: FUNDING_SUMMARY_COLUMNS, rows: buildFundingSummaryRows, label: "FundingSummary" },
  allocation: { columns: ALLOCATION_COLUMNS, rows: buildAllocationRows, label: "FundingAllocation" },
  "data-gap": { columns: DATA_GAP_COLUMNS, rows: buildDataGapRows, label: "DataGap" },
  "vendor-offer": { columns: VENDOR_OFFER_COLUMNS, rows: buildVendorOfferRows, label: "VendorOffer" },
};

export async function buildExport(runId: string, type: ExportType, format: ExportFormat): Promise<ExportFile> {
  const cfg = CONFIG[type];
  const rows = await cfg.rows(runId);
  const content = serialize(rows, cfg.columns, format);
  const ext = format === "tsv" ? "txt" : "csv";
  // Hard rule: CSV/XLSX exports are review-only and can never be labeled Keystroke import-ready.
  return {
    fileName: `IFM_Internal_${cfg.label}_${runId.slice(0, 8)}.${ext}`,
    mime: format === "tsv" ? "text/plain" : "text/csv",
    content,
    keystrokeImportReady: false,
  };
}

// Keystroke import-ready validation — Document 6 §7. Only tab-delimited .txt qualifies.
export interface KeystrokeValidation {
  passed: boolean;
  fileExtensionTxt: boolean;
  delimiterTab: boolean;
  notes: string[];
}

export function validateKeystrokeFormat(fileName: string, format: ExportFormat): KeystrokeValidation {
  const notes: string[] = [];
  const fileExtensionTxt = fileName.toLowerCase().endsWith(".txt");
  const delimiterTab = format === "tsv";
  if (!fileExtensionTxt) notes.push("File extension must be .txt.");
  if (!delimiterTab) notes.push("Delimiter must be tab. CSV/XLSX cannot be Keystroke import-ready.");
  return { passed: fileExtensionTxt && delimiterTab, fileExtensionTxt, delimiterTab, notes };
}
