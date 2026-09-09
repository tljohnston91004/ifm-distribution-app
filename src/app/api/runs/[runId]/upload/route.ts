import { NextResponse } from "next/server";
import { getUploadDomain, type UploadDomainId } from "@/lib/ifm/upload/domains";
import { filenameDomainMismatchMessage } from "@/lib/ifm/upload/filename-hints";
import { importUploadRows } from "@/lib/ifm/upload/import";
import { parseUploadFile } from "@/lib/ifm/upload/parse";
import { prisma } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  try {
    const form = await req.formData();
    const domainId = String(form.get("domain") ?? "").trim() as UploadDomainId;
    const file = form.get("file");

    if (!domainId) {
      return NextResponse.json({ error: "domain is required." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }

    const domain = getUploadDomain(domainId);
    if (!domain) {
      return NextResponse.json({ error: `Unknown domain: ${domainId}` }, { status: 400 });
    }

    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
      return NextResponse.json(
        { error: "Only .csv, .xlsx, and .xls files are accepted for review uploads." },
        { status: 400 },
      );
    }

    const filenameHint = filenameDomainMismatchMessage(file.name, domainId);
    if (filenameHint) {
      return NextResponse.json({ error: filenameHint }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const run = await prisma.ifmRun.findUnique({
      where: { id: runId },
      select: { reviewDate: true, runwayWeeks: true },
    });
    if (!run) {
      return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }

    const parsed = parseUploadFile(buffer, file.name, domain, {
      reviewDate: run.reviewDate,
      runwayWeeks: run.runwayWeeks || 13,
    });

    const sourceSystemName = String(form.get("sourceSystemName") ?? "File upload").trim() || "File upload";
    const sourceSystemType = String(form.get("sourceSystemType") ?? "spreadsheet").trim() || "spreadsheet";
    const replaceExisting = form.get("replaceExisting") !== "false";

    const result = await importUploadRows(runId, domainId, parsed.rows, {
      sourceSystemName,
      sourceSystemType,
      sourceDocumentName: file.name,
      replaceExisting,
    }, parsed.warnings);

    return NextResponse.json({
      ...result,
      message: result.replaced
        ? `Imported ${result.imported} row(s) into ${domain.label}${result.totalRows != null ? ` (${result.totalRows} total).` : "."}`
        : `Added ${result.imported} row(s) to ${domain.label}${result.totalRows != null ? ` (${result.totalRows} total).` : "."}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
