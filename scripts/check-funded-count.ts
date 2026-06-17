import { prisma } from "../src/lib/db";

async function main() {
  const runId = "3dd1e9e9-7795-4311-a022-a0a35537fe6f";
  const run = await prisma.ifmRun.findUnique({
    where: { id: runId },
    include: {
      purchaseDecisions: { include: { candidate: true } },
      fundingAllocations: true,
    },
  });
  if (!run) throw new Error("run not found");

  const alloc = new Map(run.fundingAllocations.map((a) => [a.purchaseCandidateId, a]));
  let funded = 0;
  let reviewer = 0;
  for (const d of run.purchaseDecisions) {
    const amount = alloc.get(d.purchaseCandidateId)?.allocatedAmount ?? 0;
    if (amount > 0) funded++;
    if (d.decisionStatus === "Reviewer" && d.approvedAmount > 0) reviewer++;
  }
  console.log(JSON.stringify({ decisions: run.purchaseDecisions.length, funded, reviewer }, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
