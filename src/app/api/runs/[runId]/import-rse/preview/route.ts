import { NextResponse } from "next/server";
import { fetchRseReadyPurchases } from "@/lib/ifm/rse-import";

/** Preview how many RSE lines are ready without importing. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const preRunId = searchParams.get("preRunId")?.trim() || undefined;

  try {
    const payload = await fetchRseReadyPurchases(preRunId);
    return NextResponse.json({
      preRunId: payload.preRunId,
      lineCount: payload.lineCount,
      totalDollars: payload.totalDollars,
      ifmActiveFlag: payload.ifmActiveFlag,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach RSE";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
