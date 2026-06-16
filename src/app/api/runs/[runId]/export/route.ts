import { NextResponse } from "next/server";
import { buildExport, type ExportFormat, type ExportType } from "@/lib/ifm/export";

const TYPES: ExportType[] = ["decision", "funding-summary", "allocation", "data-gap", "vendor-offer", "po-handoff"];

export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const url = new URL(req.url);
  const type = (url.searchParams.get("type") ?? "decision") as ExportType;
  const format = (url.searchParams.get("format") ?? "csv") as ExportFormat;

  if (!TYPES.includes(type)) {
    return NextResponse.json({ error: `Unknown export type: ${type}` }, { status: 400 });
  }

  try {
    const file = await buildExport(runId, type, format);
    return new NextResponse(file.content, {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `attachment; filename="${file.fileName}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}
