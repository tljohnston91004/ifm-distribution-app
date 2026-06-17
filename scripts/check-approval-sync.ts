import { prisma } from "../src/lib/db";

async function main() {
  const approved = await prisma.purchaseDecision.findMany({
    where: { decisionStatus: "Reviewer", approvedAmount: { gt: 0 } },
    include: { candidate: { include: { sources: true } }, run: true },
    take: 10,
  });

  const totalApproved = await prisma.purchaseDecision.count({
    where: { decisionStatus: "Reviewer", approvedAmount: { gt: 0 } },
  });

  const byVendor = await prisma.purchaseDecision.groupBy({
    by: ["purchaseCandidateId"],
    where: { decisionStatus: "Reviewer", approvedAmount: { gt: 0 } },
  });

  const decisions = await prisma.purchaseDecision.findMany({
    where: { decisionStatus: "Reviewer", approvedAmount: { gt: 0 } },
    include: { candidate: true, run: true },
  });

  const vendorCounts = new Map<string, number>();
  for (const d of decisions) {
    vendorCounts.set(d.candidate.vendorName, (vendorCounts.get(d.candidate.vendorName) ?? 0) + 1);
  }

  console.log(
    JSON.stringify(
      {
        totalApproved,
        byVendor: Object.fromEntries(vendorCounts),
        samples: approved.map((d) => ({
          runId: d.run.id,
          runName: d.run.runName,
          vendor: d.candidate.vendorName,
          sku: d.candidate.skuOrItemId,
          approvedAmount: d.approvedAmount,
          preLineId: d.candidate.sources.find((s) => s.sourceType === "RSE Recommendation")
            ?.sourceReferenceId,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
