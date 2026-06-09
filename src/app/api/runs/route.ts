import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface CreateRunBody {
  companyName: string;
  runName: string;
  reviewDate: string;
  fundingWindowStart: string;
  fundingWindowEnd: string;
  protectedCashReserve?: number;
  ownerApprovalThreshold?: number;
  emergencyHoldbackAmount?: number;
  vendorConcentrationLimit?: number;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateRunBody;
    if (!body.companyName || !body.runName) {
      return NextResponse.json({ error: "Company name and run name are required." }, { status: 400 });
    }

    const company =
      (await prisma.company.findFirst({ where: { companyName: body.companyName } })) ??
      (await prisma.company.create({
        data: {
          companyName: body.companyName,
          businessType: "Distributor",
          reviewSettings: {
            create: {
              protectedCashReserve: body.protectedCashReserve ?? 0,
              ownerApprovalThreshold: body.ownerApprovalThreshold ?? 25000,
              emergencyHoldbackAmount: body.emergencyHoldbackAmount ?? 0,
              vendorConcentrationLimit: body.vendorConcentrationLimit ?? 0.35,
            },
          },
        },
      }));

    const run = await prisma.ifmRun.create({
      data: {
        companyId: company.id,
        runName: body.runName,
        reviewDate: new Date(body.reviewDate),
        fundingWindowStart: new Date(body.fundingWindowStart),
        fundingWindowEnd: new Date(body.fundingWindowEnd),
        runStatus: "Draft",
      },
    });

    return NextResponse.json({ runId: run.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Create run failed" },
      { status: 500 }
    );
  }
}
