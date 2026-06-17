import { resolveCandidateVendorName } from "@/lib/ifm/vendor-names";
import { canOverrideApprove, canReviewerApprove, isReviewerApproved } from "@/lib/ifm/reviewer-approval";

export interface DecisionRowInput {
  decision: {
    id: string;
    systemDecisionLabel: string;
    ownerApprovalRequired: boolean;
    financingApprovalRequired: boolean;
    delayedAmount: number;
    excludedAmount: number;
    decisionStatus: string;
    approvedAmount: number;
    candidate: {
      id: string;
      vendorName: string;
      skuOrItemId: string | null;
      estimatedTotalCost: number;
      sources: Array<{ sourceReferenceId: string | null }>;
    };
  };
  alloc: {
    allocatedAmount: number;
    unfundedAmount: number;
    allocationPriority: number | null;
    fundingSource: string;
  } | null;
}

export interface VendorSummaryRow {
  vendorName: string;
  skuCount: number;
  requestedTotal: number;
  recommendedTotal: number;
  unfundedTotal: number;
  approvedCount: number;
  cautionCount: number;
  delayedCount: number;
  topDecision: string;
  needsOwnerApproval: boolean;
  needsFinancingApproval: boolean;
  minPriority: number;
  fundingSources: string[];
  reviewerApprovedTotal: number;
  reviewerApprovedSkuCount: number;
  canReviewerApprove: boolean;
  canOverrideApprove: boolean;
  overrideDecisionIds: string[];
  decisionIds: string[];
}

function decisionBucket(label: string): "approved" | "caution" | "delayed" | "other" {
  if (/Approve\b/.test(label) || label === "Take Full Vendor Offer") return "approved";
  if (/Caution|Partial|Reduce|Split/.test(label)) return "caution";
  if (/Decline|Hold|Delay/.test(label)) return "delayed";
  return "other";
}

function canReviewerApproveLine(decision: {
  ownerApprovalRequired: boolean;
  financingApprovalRequired: boolean;
  systemDecisionLabel: string;
}): boolean {
  return canReviewerApprove(decision);
}

export function buildVendorSummaries(
  rows: DecisionRowInput[],
  nameMap: Map<string, string>,
): VendorSummaryRow[] {
  const groups = new Map<
    string,
    VendorSummaryRow & { _sources: Set<string>; _canApproveLines: number; _decisionIds: string[]; _overrideIds: string[] }
  >();

  for (const { decision: dn, alloc } of rows) {
    const sourceRef = dn.candidate.sources[0]?.sourceReferenceId ?? null;
    const vendorName = resolveCandidateVendorName(dn.candidate, sourceRef, nameMap);
    const key = vendorName.toLowerCase();

    const requested = dn.candidate.estimatedTotalCost;
    const recommended = alloc?.allocatedAmount ?? 0;
    const unfunded =
      (alloc?.unfundedAmount ?? 0) + dn.delayedAmount + dn.excludedAmount;
    const bucket = decisionBucket(dn.systemDecisionLabel);
    const priority = alloc?.allocationPriority ?? 99;

    let row = groups.get(key);
    if (!row) {
      row = {
        vendorName,
        skuCount: 0,
        requestedTotal: 0,
        recommendedTotal: 0,
        unfundedTotal: 0,
        approvedCount: 0,
        cautionCount: 0,
        delayedCount: 0,
        topDecision: dn.systemDecisionLabel,
        needsOwnerApproval: false,
        needsFinancingApproval: false,
        minPriority: priority,
        fundingSources: [],
        reviewerApprovedTotal: 0,
        reviewerApprovedSkuCount: 0,
        canReviewerApprove: false,
        canOverrideApprove: false,
        overrideDecisionIds: [],
        decisionIds: [],
        _sources: new Set<string>(),
        _canApproveLines: 0,
        _decisionIds: [],
        _overrideIds: [],
      };
      groups.set(key, row);
    }

    row.skuCount += 1;
    row._decisionIds.push(dn.id);
    row.requestedTotal += requested;
    row.recommendedTotal += recommended;
    row.unfundedTotal += unfunded;
    if (bucket === "approved") row.approvedCount += 1;
    if (bucket === "caution") row.cautionCount += 1;
    if (bucket === "delayed") row.delayedCount += 1;
    row.needsOwnerApproval ||= dn.ownerApprovalRequired;
    row.needsFinancingApproval ||= dn.financingApprovalRequired;
    row.minPriority = Math.min(row.minPriority, priority);
    if (alloc?.fundingSource) row._sources.add(alloc.fundingSource);
    if (isReviewerApproved(dn)) {
      row.reviewerApprovedTotal += dn.approvedAmount;
      row.reviewerApprovedSkuCount += 1;
    }
    if (canReviewerApproveLine(dn) && recommended > 0 && !isReviewerApproved(dn)) {
      row._canApproveLines += 1;
      row.canReviewerApprove = true;
    }
    if (canOverrideApprove(dn) && !isReviewerApproved(dn)) {
      row.canOverrideApprove = true;
      row._overrideIds.push(dn.id);
    }
    if (row.delayedCount > row.approvedCount) row.topDecision = "Mixed — review items";
    else if (row.approvedCount === row.skuCount) row.topDecision = "Approve vendor batch";
    else if (row.cautionCount > 0 && row.approvedCount > 0) row.topDecision = "Approve with Caution (mixed)";
    else if (row.delayedCount > 0) row.topDecision = "Partially funded / delayed";
  }

  return [...groups.values()]
    .map(({ _sources, _canApproveLines, _decisionIds, _overrideIds, ...row }) => ({
      ...row,
      decisionIds: _decisionIds,
      overrideDecisionIds: _overrideIds,
      requestedTotal: Math.round(row.requestedTotal * 100) / 100,
      recommendedTotal: Math.round(row.recommendedTotal * 100) / 100,
      unfundedTotal: Math.round(row.unfundedTotal * 100) / 100,
      reviewerApprovedTotal: Math.round(row.reviewerApprovedTotal * 100) / 100,
      fundingSources: [..._sources],
      canReviewerApprove: row.canReviewerApprove || _canApproveLines > 0,
    }))
    .sort((a, b) => a.minPriority - b.minPriority || b.recommendedTotal - a.recommendedTotal);
}
