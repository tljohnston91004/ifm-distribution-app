import { NextResponse } from "next/server";
import { getUploadStatus } from "@/lib/ifm/upload/import";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  try {
    const status = await getUploadStatus(runId);
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load upload status.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
