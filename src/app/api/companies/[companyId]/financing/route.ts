import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.reviewSettings.findFirst({ where: { companyId } });
  const data = {
    runwayWeeks: body.runwayWeeks != null ? Number(body.runwayWeeks) : undefined,
    collectionLagDays: body.collectionLagDays != null ? Number(body.collectionLagDays) : undefined,
    typicalCustomerPayDays:
      body.typicalCustomerPayDays != null ? Number(body.typicalCustomerPayDays) : undefined,
    factoringActive: body.factoringActive != null ? Boolean(body.factoringActive) : undefined,
    factoringAdvanceRate:
      body.factoringAdvanceRate != null ? Number(body.factoringAdvanceRate) : undefined,
    factoringReserveRate:
      body.factoringReserveRate != null ? Number(body.factoringReserveRate) : undefined,
    factoringFeePercent:
      body.factoringFeePercent != null ? Number(body.factoringFeePercent) : undefined,
    factoringAdvanceLagDays:
      body.factoringAdvanceLagDays != null ? Number(body.factoringAdvanceLagDays) : undefined,
    chargebackTriggerType:
      body.chargebackTriggerType != null ? String(body.chargebackTriggerType) : undefined,
    chargebackTriggerDays:
      body.chargebackTriggerDays != null ? Number(body.chargebackTriggerDays) : undefined,
    locActive: body.locActive != null ? Boolean(body.locActive) : undefined,
    protectedCashReserve:
      body.protectedCashReserve != null ? Number(body.protectedCashReserve) : undefined,
  };

  const cleaned = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined),
  );

  if (existing) {
    await prisma.reviewSettings.update({ where: { id: existing.id }, data: cleaned });
  } else {
    await prisma.reviewSettings.create({
      data: { companyId, ...cleaned },
    });
  }

  const settings = await prisma.reviewSettings.findFirst({ where: { companyId } });
  return NextResponse.json(settings);
}
