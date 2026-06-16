import { prisma } from "../src/lib/db";

const CASH_ON_HAND = 500_000;

async function main() {
  const run = await prisma.ifmRun.findFirst({
    where: { purchaseCandidates: { some: {} } },
    orderBy: { createdAt: "desc" },
    include: { cashPositions: true, _count: { select: { purchaseCandidates: true } } },
  });

  if (!run) throw new Error("No IFM run with purchase candidates found.");

  if (run.cashPositions.length > 0) {
    const updated = await prisma.cashPosition.update({
      where: { id: run.cashPositions[0].id },
      data: {
        cashOnHand: CASH_ON_HAND,
        availableOperatingCash: CASH_ON_HAND,
        cashAsOfDate: new Date(),
        dataSource: "User entry",
        dataConfidence: "High Confidence",
      },
    });
    console.log(
      JSON.stringify({
        action: "updated",
        runId: run.id,
        runName: run.runName,
        candidates: run._count.purchaseCandidates,
        cashOnHand: updated.cashOnHand,
      }),
    );
    return;
  }

  const created = await prisma.cashPosition.create({
    data: {
      ifmRunId: run.id,
      cashOnHand: CASH_ON_HAND,
      availableOperatingCash: CASH_ON_HAND,
      cashAsOfDate: new Date(),
      dataSource: "User entry",
      dataConfidence: "High Confidence",
    },
  });

  console.log(
    JSON.stringify({
      action: "created",
      runId: run.id,
      runName: run.runName,
      candidates: run._count.purchaseCandidates,
      cashOnHand: created.cashOnHand,
    }),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
