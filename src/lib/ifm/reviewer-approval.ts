import { prisma } from "@/lib/db";

export interface ApproveResult {
  approved: number;
  skipped: number;
  totalApprovedDollars: number;
}

function canReviewerApprove(decision: {
  ownerApprovalRequired: boolean;
  financingApprovalRequired: boolean;
  systemDecisionLabel: string;
}): boolean {
  if (decision.ownerApprovalRequired || decision.financingApprovalRequired) return false;
  if (/Decline|Hold Until|Delay Purchase/.test(decision.systemDecisionLabel)) return false;
  return true;
}

export async function approveReviewerDecisions(
  runId: string,
  filter: { vendorName?: string; decisionIds?: string[] },
): Promise<ApproveResult> {
  const run = await prisma.ifmRun.findUnique({
    where: { id: runId },
    include: {
      purchaseDecisions: {
        include: {
          candidate: true,
        },
      },
      fundingAllocations: true,
    },
  });
  if (!run) throw new Error("IFM run not found");

  const allocByCandidate = new Map(run.fundingAllocations.map((a) => [a.purchaseCandidateId, a]));
  let approved = 0;
  let skipped = 0;
  let totalApprovedDollars = 0;

  for (const decision of run.purchaseDecisions) {
    if (filter.decisionIds && !filter.decisionIds.includes(decision.id)) continue;
    if (filter.vendorName && decision.candidate.vendorName !== filter.vendorName) continue;

    const alloc = allocByCandidate.get(decision.purchaseCandidateId);
    const funded = alloc?.allocatedAmount ?? 0;

    if (!canReviewerApprove(decision) || funded <= 0) {
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
  }

  return {
    approved,
    skipped,
    totalApprovedDollars: Math.round(totalApprovedDollars * 100) / 100,
  };
}

export function isReviewerApproved(decision: {
  decisionStatus: string;
  approvedAmount: number;
}): boolean {
  return decision.decisionStatus === "Reviewer" && decision.approvedAmount > 0;
}
