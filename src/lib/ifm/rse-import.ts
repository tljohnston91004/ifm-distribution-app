import { prisma } from "@/lib/db";
import { resolveDisplayVendorName } from "@/lib/ifm/vendor-names";
import { parseTermsToSchedule } from "@/lib/ifm/terms/parse-terms";

const DEFAULT_RSE_API_URL = "http://127.0.0.1:3000";

export interface RseReadyPurchaseLine {
  preLineId: string;
  preRunId: string;
  skuId: string;
  vendorName: string | null;
  vendorId: string | null;
  vendorGroupName?: string | null;
  vendorItemNumber: string | null;
  buyerApprovedQty: number;
  unitCost: number | null;
  estimatedTotalCost: number;
  suggestedDollars: number | null;
  preStatus: string;
  ifmStatus: string;
  urgencyLevel: string;
  rygStatus: string;
  approvedMin: number | null;
  approvedMax: number | null;
  approvedClass: string | null;
  availableInventoryPosition: number | null;
  targetStockingPosition: number | null;
  standardVendorTerms?: string | null;
  orderTerms?: string | null;
  termsStatus?: string;
  orderDiscountScope?: string | null;
  orderDiscountType?: string | null;
  orderDiscountValue?: number | null;
  orderDiscountNote?: string | null;
  standardUnitCost?: number | null;
}

export interface RseReadyPurchasesResponse {
  preRunId: string;
  rseRunId: string;
  preRunStatus: string;
  ifmActiveFlag: boolean;
  lineCount: number;
  totalDollars: number;
  lines: RseReadyPurchaseLine[];
}

function rseApiBase(): string {
  return (process.env.RSE_API_URL ?? DEFAULT_RSE_API_URL).replace(/\/$/, "");
}

export { rseApiBase };

export async function fetchRseReadyPurchases(preRunId?: string): Promise<RseReadyPurchasesResponse> {
  const url = new URL(`${rseApiBase()}/api/ifm/ready-purchases`);
  if (preRunId) url.searchParams.set("preRunId", preRunId);

  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "no-store" });
  } catch {
    throw new Error(
      `Could not reach RSE at ${rseApiBase()}. Start RSE (Start RSE.bat) and try again.`,
    );
  }

  const data = (await res.json()) as RseReadyPurchasesResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `RSE returned ${res.status}`);
  }
  return data;
}

function mapUrgency(level: string): string {
  const v = level.toLowerCase();
  if (v === "critical") return "high";
  if (v === "high") return "high";
  if (v === "medium") return "medium";
  if (v === "opportunity") return "low";
  return "medium";
}

function mapEvidenceStrength(ryg: string): string {
  const v = ryg.toLowerCase();
  if (v === "green") return "strong";
  if (v === "yellow") return "moderate";
  if (v === "red") return "weak";
  return "moderate";
}

function vendorLabel(line: RseReadyPurchaseLine): string {
  return resolveDisplayVendorName({
    vendorName: line.vendorName,
    vendorId: line.vendorId,
    vendorGroupName: line.vendorGroupName ?? null,
  });
}

function belowMin(line: RseReadyPurchaseLine): boolean | null {
  if (line.approvedMin == null || line.availableInventoryPosition == null) return null;
  return line.availableInventoryPosition < line.approvedMin;
}

function demandSupport(ryg: string): string | null {
  const v = ryg.toLowerCase();
  if (v === "green") return "strong";
  if (v === "yellow") return "moderate";
  if (v === "red") return "weak";
  return null;
}

export interface ImportRseResult {
  imported: number;
  skipped: number;
  preRunId: string;
  rseRunId: string;
  totalDollars: number;
  vendorCount: number;
}

export async function importRseIntoRun(
  ifmRunId: string,
  options: { preRunId?: string; replaceExisting?: boolean } = {},
): Promise<ImportRseResult> {
  const payload = await fetchRseReadyPurchases(options.preRunId);

  if (payload.lines.length === 0) {
    throw new Error(
      "RSE has no lines in Ready for IFM Review. Approve purchases in RSE PRE first.",
    );
  }

  const run = await prisma.ifmRun.findUnique({ where: { id: ifmRunId } });
  if (!run) throw new Error("IFM run not found");

  if (options.replaceExisting !== false) {
    await prisma.purchaseCandidate.deleteMany({
      where: { ifmRunId, sourceOfRequest: "RSE Recommendation" },
    });
    await prisma.rseSignal.deleteMany({ where: { ifmRunId } });
  }

  const vendors = new Set<string>();
  let imported = 0;

  for (const line of payload.lines) {
    if (line.estimatedTotalCost <= 0 && line.buyerApprovedQty <= 0) continue;

    const vendorName = vendorLabel(line);
    vendors.add(vendorName);

    const termsStatus = line.termsStatus ?? "pending";
    const orderTerms = line.orderTerms ?? null;
    const anchor = run.reviewDate;
    const schedule =
      orderTerms && termsStatus !== "pending"
        ? parseTermsToSchedule(orderTerms, Math.max(0, line.estimatedTotalCost), anchor)
        : null;

    await prisma.purchaseCandidate.create({
      data: {
        ifmRunId,
        sourceOfRequest: "RSE Recommendation",
        vendorName,
        skuOrItemId: line.skuId,
        proposedQuantity: line.buyerApprovedQty,
        estimatedUnitCost: line.unitCost ?? undefined,
        estimatedTotalCost: Math.max(0, line.estimatedTotalCost),
        needReason: "RSE PRE replenishment — Ready for IFM Review",
        urgencyLevel: mapUrgency(line.urgencyLevel),
        dataConfidence: "Medium Confidence",
        supportingEvidence: `RSE PRE ${line.preRunId.slice(0, 8)} · ${line.preStatus} · ${line.ifmStatus}`,
        standardVendorTerms: line.standardVendorTerms ?? null,
        orderTerms,
        termsStatus,
        orderDiscountScope: line.orderDiscountScope ?? null,
        orderDiscountType: line.orderDiscountType ?? null,
        orderDiscountValue: line.orderDiscountValue ?? null,
        orderDiscountNote: line.orderDiscountNote ?? null,
        standardUnitCost: line.standardUnitCost ?? line.unitCost ?? null,
        expectedPurchaseDate: anchor,
        paymentScheduleJson: schedule
          ? JSON.stringify(
              schedule.installments.map((i) => ({
                dueDate: i.dueDate.toISOString(),
                amount: i.amount,
                label: i.label,
              })),
            )
          : null,
        sources: {
          create: [
            {
              sourceType: "RSE Recommendation",
              sourceReferenceId: line.preLineId,
              evidenceStrength: mapEvidenceStrength(line.rygStatus),
              sourceConfidence: "Medium Confidence",
              sourceNote: `Imported from RSE PRE. RYG: ${line.rygStatus}. Urgency: ${line.urgencyLevel}.`,
            },
          ],
        },
      },
    });

    const existingSignal = await prisma.rseSignal.findFirst({
      where: { ifmRunId, skuOrItemId: line.skuId },
    });

    const signalData = {
      vendorName,
      rseClassification: line.approvedClass,
      classificationConfidence: "Medium Confidence",
      rseReplenishmentSignal: "increase",
      recommendedMin: line.approvedMin,
      recommendedMax: line.approvedMax,
      belowMinFlag: belowMin(line),
      demandSupportLevel: demandSupport(line.rygStatus),
      rseRunId: payload.rseRunId,
    };

    if (existingSignal) {
      await prisma.rseSignal.update({ where: { id: existingSignal.id }, data: signalData });
    } else {
      await prisma.rseSignal.create({
        data: { ifmRunId, skuOrItemId: line.skuId, ...signalData },
      });
    }

    imported += 1;
  }

  await prisma.ifmRun.update({
    where: { id: ifmRunId },
    data: { runStatus: "Data Uploaded" },
  });

  return {
    imported,
    skipped: payload.lines.length - imported,
    preRunId: payload.preRunId,
    rseRunId: payload.rseRunId,
    totalDollars: payload.totalDollars,
    vendorCount: vendors.size,
  };
}
