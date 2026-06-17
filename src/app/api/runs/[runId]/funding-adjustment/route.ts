import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeRun } from "@/lib/ifm/compute";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  let body: {
    manualCashAddition?: number;
    manualCashReduction?: number;
    fundingAdjustmentNote?: string;
    recalculate?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const addition = Math.max(0, Number(body.manualCashAddition) || 0);
  const reduction = Math.max(0, Number(body.manualCashReduction) || 0);
  const note = body.fundingAdjustmentNote?.trim() || null;

  if (addition > 0 && !note) {
    return NextResponse.json(
      { error: "Provide a note explaining the manual cash addition (e.g. expected investment)." },
      { status: 400 },
    );
  }

  const run = await prisma.ifmRun.findUnique({ where: { id: runId } });
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  await prisma.ifmRun.update({
    where: { id: runId },
    data: {
      manualCashAddition: addition,
      manualCashReduction: reduction,
      fundingAdjustmentNote: note,
    },
  });

  if (body.recalculate) {
    try {
      await computeRun(runId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Recalculation failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  return NextResponse.json({
    manualCashAddition: addition,
    manualCashReduction: reduction,
    fundingAdjustmentNote: note,
    recalculated: Boolean(body.recalculate),
  });
}
