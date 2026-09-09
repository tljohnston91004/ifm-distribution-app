import { prisma } from "../src/lib/db";

const runId = process.argv[2] ?? "273fd473-baa1-4f56-bfd6-cdcc62672382";

async function main() {
  const run = await prisma.ifmRun.findUnique({
    where: { id: runId },
    include: {
      _count: {
        select: {
          cashPositions: true,
          apItems: true,
          arItems: true,
          requiredOutflows: true,
          openPurchaseOrders: true,
          purchaseCandidates: true,
        },
      },
    },
  });
  if (!run) {
    console.log("Run not found:", runId);
    return;
  }
  console.log(JSON.stringify({ id: run.id, status: run.runStatus, confirmedNone: run.confirmedNoneJson, counts: run._count }, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
