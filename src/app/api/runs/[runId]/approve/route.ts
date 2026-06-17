import { NextResponse } from "next/server";
import { approveReviewerDecisions } from "@/lib/ifm/reviewer-approval";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  let body: {
    vendorName?: string;
    decisionIds?: string[];
    override?: boolean;
    overrideReason?: string;
    ownerConfirm?: boolean;
    amounts?: Record<string, number>;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.vendorName && (!body.decisionIds || body.decisionIds.length === 0)) {
    return NextResponse.json(
      { error: "Provide vendorName or decisionIds to approve." },
      { status: 400 },
    );
  }

  if (body.override && !body.overrideReason?.trim()) {
    return NextResponse.json({ error: "Override requires overrideReason." }, { status: 400 });
  }

  try {
    const result = await approveReviewerDecisions(runId, body);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Approval failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
