import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchRseReadyPurchases } from "@/lib/ifm/rse-import";
import { buildVendorNameMapFromRse, resolveDisplayVendorName } from "@/lib/ifm/vendor-names";

/** Re-apply vendor display names from RSE for already-imported purchase candidates. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  try {
    const run = await prisma.ifmRun.findUnique({
      where: { id: runId },
      include: {
        purchaseCandidates: {
          where: { sourceOfRequest: "RSE Recommendation" },
          include: { sources: true },
        },
      },
    });
    if (!run) return NextResponse.json({ error: "IFM run not found" }, { status: 404 });
    if (run.purchaseCandidates.length === 0) {
      return NextResponse.json({ error: "No RSE purchase candidates on this run." }, { status: 400 });
    }

    const rse = await fetchRseReadyPurchases();
    const nameMap = buildVendorNameMapFromRse(rse.lines);
    let updated = 0;

    for (const candidate of run.purchaseCandidates) {
      const sourceRef = candidate.sources[0]?.sourceReferenceId;
      const line = sourceRef
        ? rse.lines.find((l) => l.preLineId === sourceRef)
        : undefined;

      const vendorName = line
        ? resolveDisplayVendorName({
            vendorName: line.vendorName,
            vendorId: line.vendorId,
            vendorGroupName: line.vendorGroupName ?? null,
          })
        : nameMap.get(`line:${sourceRef}`) ?? candidate.vendorName;

      if (vendorName !== candidate.vendorName) {
        await prisma.purchaseCandidate.update({
          where: { id: candidate.id },
          data: { vendorName },
        });
        updated += 1;
      }
    }

    return NextResponse.json({ updated, total: run.purchaseCandidates.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Vendor name refresh failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
