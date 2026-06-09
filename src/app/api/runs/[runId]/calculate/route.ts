import { NextResponse } from "next/server";
import { computeRun } from "@/lib/ifm/compute";

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  try {
    const result = await computeRun(runId);
    return NextResponse.json({ ok: true, readiness: result.readiness, funding: result.funding });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Calculation failed" },
      { status: 500 }
    );
  }
}
