import { NextResponse } from "next/server";
import { getUploadDomain, type UploadDomainId } from "@/lib/ifm/upload/domains";
import { clearDomainUpload } from "@/lib/ifm/upload/import";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  try {
    const body = (await req.json()) as { domain?: string };
    const domainId = body.domain?.trim() as UploadDomainId;
    if (!domainId) {
      return NextResponse.json({ error: "domain is required." }, { status: 400 });
    }

    const domain = getUploadDomain(domainId);
    if (!domain) {
      return NextResponse.json({ error: `Unknown domain: ${domainId}` }, { status: 400 });
    }

    const deleted = await clearDomainUpload(runId, domainId);
    return NextResponse.json({
      domain: domainId,
      deleted,
      message: `Cleared ${deleted} row(s) from ${domain.label}.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Clear failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
