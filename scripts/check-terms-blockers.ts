import { prisma } from "../src/lib/db";

const runId = process.argv[2] ?? "273fd473-baa1-4f56-bfd6-cdcc62672382";

async function main() {
  const terms = await prisma.purchaseCandidate.groupBy({
    by: ["termsStatus"],
    where: { ifmRunId: runId },
    _count: true,
  });
  console.log("Terms status counts:", terms);

  const decisions = await prisma.purchaseDecision.findMany({
    where: { ifmRunId: runId },
    include: {
      candidate: { select: { vendorName: true, skuOrItemId: true, termsStatus: true, estimatedTotalCost: true } },
    },
  });

  const allocs = await prisma.fundingAllocation.findMany({ where: { ifmRunId: runId } });
  const allocMap = new Map(allocs.map((a) => [a.purchaseCandidateId, a]));

  let pendingTerms = 0;
  let zeroFunded = 0;
  let ownerBlock = 0;
  let finBlock = 0;
  let decisionBlock = 0;

  for (const d of decisions) {
    const alloc = allocMap.get(d.purchaseCandidateId);
    const funded = alloc?.allocatedAmount ?? 0;
    if (d.candidate.termsStatus === "pending") pendingTerms++;
    if (funded <= 0) zeroFunded++;
    if (d.ownerApprovalRequired) ownerBlock++;
    if (d.financingApprovalRequired) finBlock++;
    if (/Decline|Hold Until|Delay Purchase/.test(d.systemDecisionLabel)) decisionBlock++;
  }

  console.log("Decision blockers:", {
    total: decisions.length,
    pendingTerms,
    zeroFunded,
    ownerBlock,
    finBlock,
    decisionBlock,
  });

  const samplePending = decisions
    .filter((d) => d.candidate.termsStatus === "pending")
    .slice(0, 3)
    .map((d) => ({ vendor: d.candidate.vendorName, sku: d.candidate.skuOrItemId }));
  console.log("Sample pending terms:", samplePending);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
