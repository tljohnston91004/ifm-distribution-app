import { NextResponse } from "next/server";
import { getUploadDomain, templateCsvForDomain } from "@/lib/ifm/upload/domains";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  await params;
  const url = new URL(req.url);
  const domainId = url.searchParams.get("domain");
  if (!domainId) {
    return NextResponse.json({ error: "domain query parameter is required." }, { status: 400 });
  }

  const domain = getUploadDomain(domainId);
  if (!domain) {
    return NextResponse.json({ error: `Unknown domain: ${domainId}` }, { status: 400 });
  }

  const csv = templateCsvForDomain(domain);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ifm-${domainId}-template.csv"`,
    },
  });
}
