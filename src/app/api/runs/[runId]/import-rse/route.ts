import { NextResponse } from "next/server";
import { importRseIntoRun } from "@/lib/ifm/rse-import";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  let preRunId: string | undefined;
  let replaceExisting = true;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      preRunId?: string;
      replaceExisting?: boolean;
    };
    if (typeof body.preRunId === "string" && body.preRunId.trim()) {
      preRunId = body.preRunId.trim();
    }
    if (body.replaceExisting === false) replaceExisting = false;
  } catch {
    // defaults are fine
  }

  try {
    const result = await importRseIntoRun(runId, { preRunId, replaceExisting });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "RSE import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
