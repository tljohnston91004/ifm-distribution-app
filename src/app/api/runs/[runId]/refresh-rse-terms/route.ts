import { NextResponse } from "next/server";
import { refreshRseTermsOnRun } from "@/lib/ifm/rse-import";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  try {
    const result = await refreshRseTermsOnRun(runId);
    return NextResponse.json({
      ...result,
      message:
        result.stillPending > 0
          ? `Updated ${result.updated} line(s). ${result.stillPending} still pending terms in RSE — confirm terms per vendor in RSE Vendor Purchase Review.`
          : `Updated ${result.updated} line(s). All vendor terms are confirmed — Approve for PO is now unblocked.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terms refresh failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
