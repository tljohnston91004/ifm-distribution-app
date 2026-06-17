import { prisma } from "@/lib/db";
import {
  mapDecisionToRseStatus,
  preLineIdFromCandidate,
  pushStatusReturnToRse,
  type RseStatusReturnItem,
} from "@/lib/ifm/rse-status-return";

export interface ApproveResult {
  approved: number;
  skipped: number;
  totalApprovedDollars: number;
  overrideCount: number;
  rseUpdated: number;
  rseFailed: number;
  rseSkipped: number;
  rseErrors?: Array<{ preLineId: string; error: string }>;
}

export interface ApproveFilter {
  vendorName?: string;
  decisionIds?: string[];
  override?: boolean;
  overrideReason?: string;
  ownerConfirm?: boolean;
  /** Per-decision approved amounts keyed by purchase decision id */
  amounts?: Record<string, number>;
}

export function canReviewerApprove(decision: {
  ownerApprovalRequired: boolean;
  financingApprovalRequired: boolean;
  systemDecisionLabel: string;
}): boolean {
  if (decision.ownerApprovalRequired || decision.financingApprovalRequired) return false;
  if (/Decline|Hold Until|Delay Purchase/.test(decision.systemDecisionLabel)) return false;
  return true;
}

export function canOverrideApprove(decision: {
  decisionStatus: string;
  approvedAmount: number;
}): boolean {
  if (isReviewerApproved(decision)) return false;
  return true;
}

export function needsOwnerSignOff(
  approvedAmount: number,
  decision: { ownerApprovalRequired: boolean },
  ownerApprovalThreshold: number,
): boolean {
  return decision.ownerApprovalRequired || approvedAmount >= ownerApprovalThreshold;
}

function isOverrideAmount(allocated: number, approvedAmount: number): boolean {
  return allocated <= 0 || approvedAmount > allocated + 0.01;
}

export function isTermsReady(candidate: { termsStatus: string }): boolean {
  return candidate.termsStatus !== "pending";
}

export async function approveReviewerDecisions(
  runId: string,
  filter: ApproveFilter,
): Promise<ApproveResult> {
  const run = await prisma.ifmRun.findUnique({
    where: { id: runId },
    include: {
      company: { include: { reviewSettings: true } },
      purchaseDecisions: {
        include: {
          candidate: { include: { sources: true } },
        },
      },
      fundingAllocations: true,
    },
  });
  if (!run) throw new Error("IFM run not found");

  const ownerThreshold =
    run.company.reviewSettings[0]?.ownerApprovalThreshold ?? 25000;

  if (filter.override) {
    const reason = filter.overrideReason?.trim();
    if (!reason || reason.length < 8) {
      throw new Error("Override requires a reason (at least 8 characters).");
    }
  }

  const allocByCandidate = new Map(run.fundingAllocations.map((a) => [a.purchaseCandidateId, a]));
  let approved = 0;
  let skipped = 0;
  let overrideCount = 0;
  let totalApprovedDollars = 0;
  const rseUpdates: RseStatusReturnItem[] = [];
  let rseSkipped = 0;

  for (const decision of run.purchaseDecisions) {
    if (filter.decisionIds && !filter.decisionIds.includes(decision.id)) continue;
    if (filter.vendorName && decision.candidate.vendorName !== filter.vendorName) continue;

    const alloc = allocByCandidate.get(decision.purchaseCandidateId);
    const funded = alloc?.allocatedAmount ?? 0;
    const requested = decision.candidate.estimatedTotalCost;

    if (!isTermsReady(decision.candidate)) {
      skipped += 1;
      continue;
    }

    if (filter.override) {
      if (!canOverrideApprove(decision)) {
        skipped += 1;
        continue;
      }

      const rawAmount = filter.amounts?.[decision.id] ?? requested;
      const approvedAmount = Math.round(Math.min(Math.max(0, rawAmount), requested) * 100) / 100;
      if (approvedAmount <= 0) {
        skipped += 1;
        continue;
      }

      const ownerRequired =
        needsOwnerSignOff(approvedAmount, decision, ownerThreshold) ||
        decision.financingApprovalRequired;
      if (ownerRequired && !filter.ownerConfirm) {
        throw new Error(
          `Owner sign-off required for $${approvedAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ` +
            `(threshold $${ownerThreshold.toLocaleString("en-US")}). Check "Owner sign-off" and retry.`,
        );
      }

      const isOverride = isOverrideAmount(funded, approvedAmount);
      const decisionStatus = ownerRequired && filter.ownerConfirm ? "Owner" : "Reviewer";
      const reasonSuffix = isOverride
        ? ` | Management override: ${filter.overrideReason!.trim()}`
        : "";

      await prisma.purchaseDecision.update({
        where: { id: decision.id },
        data: {
          approvedAmount,
          decisionStatus,
          decisionReason: decision.decisionReason.replace(/\.$/, "") + reasonSuffix + ".",
        },
      });

      approved += 1;
      if (isOverride) overrideCount += 1;
      totalApprovedDollars += approvedAmount;

      const preLineId = preLineIdFromCandidate(decision.candidate);
      if (!preLineId) {
        rseSkipped += 1;
        continue;
      }

      const mapped = mapDecisionToRseStatus({
        systemDecisionLabel: isOverride ? "Approve" : decision.systemDecisionLabel,
        requestedAmount: requested,
        approvedAmount,
        proposedQuantity: decision.candidate.proposedQuantity,
        estimatedUnitCost: decision.candidate.estimatedUnitCost,
      });

      rseUpdates.push({
        preLineId,
        ifmStatus: mapped.ifmStatus,
        finalQty: mapped.finalQty,
        notes:
          `IFM ${decisionStatus.toLowerCase()} approved $${approvedAmount.toFixed(2)}` +
          (isOverride ? ` (override: ${filter.overrideReason!.trim()})` : ` (${decision.systemDecisionLabel})`),
      });
      continue;
    }

    if (!canReviewerApprove(decision) || funded <= 0) {
      skipped += 1;
      continue;
    }

    if (!isTermsReady(decision.candidate)) {
      skipped += 1;
      continue;
    }

    await prisma.purchaseDecision.update({
      where: { id: decision.id },
      data: {
        approvedAmount: funded,
        decisionStatus: "Reviewer",
      },
    });

    approved += 1;
    totalApprovedDollars += funded;

    const preLineId = preLineIdFromCandidate(decision.candidate);
    if (!preLineId) {
      rseSkipped += 1;
      continue;
    }

    const mapped = mapDecisionToRseStatus({
      systemDecisionLabel: decision.systemDecisionLabel,
      requestedAmount: requested,
      approvedAmount: funded,
      proposedQuantity: decision.candidate.proposedQuantity,
      estimatedUnitCost: decision.candidate.estimatedUnitCost,
    });

    rseUpdates.push({
      preLineId,
      ifmStatus: mapped.ifmStatus,
      finalQty: mapped.finalQty,
      notes: `IFM reviewer approved $${funded.toFixed(2)} (${decision.systemDecisionLabel})`,
    });
  }

  let rseUpdated = 0;
  let rseFailed = 0;
  let rseErrors: ApproveResult["rseErrors"];

  if (rseUpdates.length > 0) {
    const rseResult = await pushStatusReturnToRse(rseUpdates);
    rseUpdated = rseResult.updated;
    rseFailed = rseResult.failed;
    rseErrors = rseResult.errors;

    if (rseFailed > 0 && rseUpdated === 0) {
      throw new Error(
        `IFM approval saved, but RSE sync failed for all ${rseFailed} line(s). ` +
          (rseErrors?.[0]?.error ?? "Check that RSE is running."),
      );
    }
  }

  if (approved === 0 && skipped > 0 && !filter.override) {
    throw new Error(
      `${skipped} line(s) skipped — confirm vendor terms in RSE (per vendor batch) before IFM approval.`,
    );
  }

  return {
    approved,
    skipped,
    totalApprovedDollars: Math.round(totalApprovedDollars * 100) / 100,
    overrideCount,
    rseUpdated,
    rseFailed,
    rseSkipped,
    rseErrors: rseErrors?.length ? rseErrors : undefined,
  };
}

export function isReviewerApproved(decision: {
  decisionStatus: string;
  approvedAmount: number;
}): boolean {
  return (decision.decisionStatus === "Reviewer" || decision.decisionStatus === "Owner") && decision.approvedAmount > 0;
}
