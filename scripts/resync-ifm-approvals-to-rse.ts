import { prisma } from "../src/lib/db";

const runId = process.argv[2] ?? "273fd473-baa1-4f56-bfd6-cdcc62672382";

async function main() {
  const run = await prisma.ifmRun.findUnique({
    where: { id: runId },
    include: {
      purchaseDecisions: {
        include: { candidate: { include: { sources: true } } },
      },
    },
  });
  if (!run) return;

  const approved = run.purchaseDecisions.filter(
    (d) => (d.decisionStatus === "Reviewer" || d.decisionStatus === "Owner") && d.approvedAmount > 0,
  );
  const notApproved = run.purchaseDecisions.filter(
    (d) => !((d.decisionStatus === "Reviewer" || d.decisionStatus === "Owner") && d.approvedAmount > 0),
  );

  console.log("Approved:", approved.length, "Not approved:", notApproved.length);

  const preLineIds = approved
    .map((d) => d.candidate.sources.find((s) => s.sourceType === "RSE Recommendation")?.sourceReferenceId)
    .filter(Boolean);

  const uniquePreRunIds = new Set<string>();
  for (const d of approved.slice(0, 5)) {
    const ref = d.candidate.supportingEvidence ?? "";
    console.log("sample supportingEvidence:", ref);
  }

  // Push status return for approved lines that may not have synced
  const { pushStatusReturnToRse, mapDecisionToRseStatus, preLineIdFromCandidate } = await import(
    "../src/lib/ifm/rse-status-return"
  );

  const updates = approved
    .map((d) => {
      const preLineId = preLineIdFromCandidate(d.candidate);
      if (!preLineId) return null;
      const mapped = mapDecisionToRseStatus({
        systemDecisionLabel: d.systemDecisionLabel,
        requestedAmount: d.candidate.estimatedTotalCost,
        approvedAmount: d.approvedAmount,
        proposedQuantity: d.candidate.proposedQuantity,
        estimatedUnitCost: d.candidate.estimatedUnitCost,
      });
      return {
        preLineId,
        ifmStatus: mapped.ifmStatus,
        finalQty: mapped.finalQty,
        notes: `IFM resync approved $${d.approvedAmount.toFixed(2)} (${d.systemDecisionLabel})`,
      };
    })
    .filter(Boolean);

  console.log("Would push", updates.length, "updates to RSE");
  if (process.argv.includes("--push")) {
    const result = await pushStatusReturnToRse(updates as any);
    console.log("Push result:", result);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
