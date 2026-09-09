import { PrismaClient as IfmPrisma } from "@prisma/client";
import { PrismaClient as RsePrisma } from "../../rse-distribution-app/node_modules/@prisma/client/index.js";

const runId = process.argv[2] ?? "273fd473-baa1-4f56-bfd6-cdcc62672382";

async function main() {
  const ifm = new IfmPrisma();
  const rse = new RsePrisma({
    datasources: { db: { url: "file:../rse-distribution-app/data/rse.db" } },
  });

  const run = await ifm.ifmRun.findUnique({
    where: { id: runId },
    include: {
      purchaseDecisions: {
        include: { candidate: { include: { sources: true } } },
      },
    },
  });
  if (!run) {
    console.log("IFM run not found");
    return;
  }

  const approved = run.purchaseDecisions.filter(
    (d) => (d.decisionStatus === "Reviewer" || d.decisionStatus === "Owner") && d.approvedAmount > 0,
  );
  const notApproved = run.purchaseDecisions.filter(
    (d) => !((d.decisionStatus === "Reviewer" || d.decisionStatus === "Owner") && d.approvedAmount > 0),
  );

  console.log("IFM run:", run.runName, run.runStatus);
  console.log("Approved in IFM:", approved.length);
  console.log("Not approved in IFM:", notApproved.length);

  const preLineIds = approved
    .map((d) => d.candidate.sources.find((s) => s.sourceType === "RSE Recommendation")?.sourceReferenceId)
    .filter(Boolean) as string[];

  const rseLines = await rse.prePurchaseLine.findMany({
    where: { id: { in: preLineIds.slice(0, 500) } },
    select: { id: true, skuId: true, vendorName: true, preStatus: true, ifmStatus: true, exportStatus: true },
  });

  const byPre = new Map(rseLines.map((l) => [l.id, l]));
  let synced = 0;
  let waiting = 0;
  let missing = 0;

  for (const id of preLineIds) {
    const line = byPre.get(id);
    if (!line) {
      missing++;
      continue;
    }
    if (line.preStatus === "IFM Reviewed" || line.ifmStatus === "Approved" || line.ifmStatus === "Approved with Caution") {
      synced++;
    } else if (line.preStatus === "Ready for IFM Review" || line.ifmStatus === "Pending IFM Review") {
      waiting++;
    }
  }

  console.log("\nRSE sync for IFM-approved lines:");
  console.log({ synced, stillWaitingOnIfm: waiting, missingPreLineLink: missing });

  const pendingSample = rseLines
    .filter((l) => l.preStatus === "Ready for IFM Review" || l.ifmStatus === "Pending IFM Review")
    .slice(0, 5);
  console.log("\nSample still waiting:", pendingSample);

  const preRun = await rse.preRecommendationRun.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, ifmActiveFlag: true, status: true },
  });
  console.log("\nLatest PRE run:", preRun);

  const rseCounts = await rse.prePurchaseLine.groupBy({
    by: ["preStatus", "ifmStatus"],
    where: preRun ? { preRunId: preRun.id, buyerApprovedQty: { gt: 0 } } : undefined,
    _count: true,
  });
  console.log("\nRSE line status counts:", rseCounts);
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
