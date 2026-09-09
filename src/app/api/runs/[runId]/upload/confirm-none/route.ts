import { NextResponse } from "next/server";
import { getUploadDomain } from "@/lib/ifm/upload/domains";
import { setConfirmedNone } from "@/lib/ifm/upload/import";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  try {
    const body = (await req.json()) as { domain?: string; confirmed?: boolean };
    const domainId = body.domain?.trim();
    if (!domainId) {
      return NextResponse.json({ error: "domain is required." }, { status: 400 });
    }

    const domain = getUploadDomain(domainId);
    if (!domain?.confirmNoneKey) {
      return NextResponse.json({ error: "This domain does not support confirm-none." }, { status: 400 });
    }

    const flags = await setConfirmedNone(runId, domain.confirmNoneKey, body.confirmed !== false);
    return NextResponse.json({
      confirmedNone: flags,
      message: body.confirmed !== false
        ? `Marked ${domain.label} as confirmed none.`
        : `Cleared confirmed-none for ${domain.label}.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Confirm-none failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
