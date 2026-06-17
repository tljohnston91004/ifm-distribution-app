import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CalculateButton, ImportRseButton } from "@/components/RunActions";
import DecisionBoard from "@/components/DecisionBoard";
import FundingAdjustmentPanel from "@/components/FundingAdjustmentPanel";
import CashRunwayPanel from "@/components/CashRunwayPanel";
import CompanyFinancingPanel from "@/components/CompanyFinancingPanel";
import { buildBanners } from "@/lib/ifm/banners";
import { fetchRseReadyPurchases } from "@/lib/ifm/rse-import";
import { buildVendorNameMapFromRse, resolveCandidateVendorName } from "@/lib/ifm/vendor-names";
import { buildVendorSummaries } from "@/lib/ifm/vendor-summary";
import {
  canOverrideApprove,
  canReviewerApprove,
  isReviewerApproved,
  needsOwnerSignOff,
} from "@/lib/ifm/reviewer-approval";
import { usd, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const BANNER_COLOR = { warn: "var(--warn)", info: "var(--accent)", bad: "var(--bad)" } as const;

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export default async function RunWorkspace({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = await prisma.ifmRun.findUnique({
    where: { id: runId },
    include: {
      company: { include: { reviewSettings: true } },
      fundingCalculation: true,
      supplementalCalc: true,
      cashRunwaySnapshot: true,
      fundingAllocations: true,
      dataGaps: true,
      purchaseDecisions: {
        include: { candidate: { include: { sources: true } } },
        orderBy: { id: "asc" },
      },
      purchaseCandidates: { select: { termsStatus: true } },
      _count: { select: { purchaseCandidates: true, cashPositions: true } },
    },
  });
  if (!run) notFound();

  const fc = run.fundingCalculation;
  const settings = run.company.reviewSettings[0];
  const holdback = settings?.emergencyHoldbackAmount ?? 0;
  const ownerApprovalThreshold = settings?.ownerApprovalThreshold ?? 25000;
  const allocByCandidate = new Map(run.fundingAllocations.map((a) => [a.purchaseCandidateId, a]));

  const rows = run.purchaseDecisions
    .map((dn) => ({ dn, alloc: allocByCandidate.get(dn.purchaseCandidateId) }))
    .sort((a, b) => (a.alloc?.allocationPriority ?? 99) - (b.alloc?.allocationPriority ?? 99));

  const totalRequested = run.purchaseDecisions.reduce((s, d) => s + d.candidate.estimatedTotalCost, 0);
  const totalRecommended = run.fundingAllocations.reduce((s, a) => s + a.allocatedAmount, 0);

  const banners = buildBanners({
    coreAvailableInventoryFunding: fc?.coreAvailableInventoryFunding,
    anyFinancingApproval: run.purchaseDecisions.some((d) => d.financingApprovalRequired),
    vendorConcentrationFlagged: run.purchaseDecisions.some((d) => /vendor concentration/i.test(d.decisionReason)),
    hasDraftPo: true,
    lowConfidenceData: fc?.fundingConfidence === "Low Confidence" || fc?.fundingConfidence === "Insufficient Data",
    vendorOfferPresent: run.purchaseDecisions.some((d) => /vendor offer|promo/i.test(d.candidate.sourceOfRequest)),
  });

  const coreAllocatable = Math.max(0, (fc?.coreAvailableInventoryFunding ?? 0) - holdback);

  const termsPendingCount =
    run.purchaseDecisions.length > 0
      ? run.purchaseDecisions.filter((d) => d.candidate.termsStatus === "pending").length
      : run.purchaseCandidates.filter((c) => c.termsStatus === "pending").length;

  const runway = run.cashRunwaySnapshot;
  const runwayWeeks = runway?.weeksJson
    ? (JSON.parse(runway.weeksJson) as unknown[]).length
    : run.runwayWeeks || settings?.runwayWeeks || 13;

  let vendorNameMap = new Map<string, string>();
  if (run.purchaseDecisions.length > 0) {
    try {
      const rse = await fetchRseReadyPurchases();
      vendorNameMap = buildVendorNameMapFromRse(rse.lines);
    } catch {
      // RSE offline — fall back to stored vendor names on candidates.
    }
  }

  const itemRows = rows.map(({ dn, alloc }) => {
    const sourceRef = dn.candidate.sources[0]?.sourceReferenceId ?? null;
    const vendorName = resolveCandidateVendorName(dn.candidate, sourceRef, vendorNameMap);
    const approval = dn.ownerApprovalRequired
      ? "Owner"
      : dn.financingApprovalRequired
      ? "Financing"
      : "Reviewer";
    const unfunded = (alloc?.unfundedAmount ?? 0) + dn.delayedAmount + dn.excludedAmount;
    const recommended = alloc?.allocatedAmount ?? 0;
    const reviewerApproved = isReviewerApproved(dn);
    const canApprove =
      canReviewerApprove(dn) && recommended > 0;
    const canOverride = canOverrideApprove(dn);
    const ownerSignOff = needsOwnerSignOff(
      Math.max(recommended, dn.candidate.estimatedTotalCost),
      dn,
      ownerApprovalThreshold,
    );
    return {
      id: dn.candidate.id,
      decisionId: dn.id,
      priority: alloc?.allocationPriority ?? "—",
      vendorName,
      sku: dn.candidate.skuOrItemId ?? dn.candidate.needReason,
      source: dn.candidate.sourceOfRequest,
      requested: dn.candidate.estimatedTotalCost,
      recommended,
      unfunded,
      decision: dn.systemDecisionLabel,
      fundingSource: alloc?.fundingSource ?? "Not Funded",
      approval,
      reason: dn.decisionReason,
      reviewerApproved,
      approvedAmount: dn.approvedAmount,
      decisionStatus: dn.decisionStatus,
      canReviewerApprove: canApprove,
      canOverrideApprove: canOverride && !reviewerApproved,
      needsOwnerSignOff: ownerSignOff,
    };
  });

  const handoffSummary = {
    approvedLines: run.purchaseDecisions.filter((d) => isReviewerApproved(d)).length,
    approvedDollars: run.purchaseDecisions
      .filter((d) => isReviewerApproved(d))
      .reduce((s, d) => s + d.approvedAmount, 0),
  };

  const vendorRows = buildVendorSummaries(
    rows.map(({ dn, alloc }) => ({
      decision: dn,
      alloc: alloc
        ? {
            allocatedAmount: alloc.allocatedAmount,
            unfundedAmount: alloc.unfundedAmount,
            allocationPriority: alloc.allocationPriority,
            fundingSource: alloc.fundingSource,
          }
        : null,
    })),
    vendorNameMap,
  );

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px 64px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <Link href="/" style={{ color: "var(--muted)" }}>← All runs</Link>
        <Link href={`/runs/${run.id}/acceptance`} style={{ color: "var(--muted)" }}>Acceptance matrix →</Link>
      </div>

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginTop: 8 }}>
        <div>
          <h1 style={{ fontSize: 26, margin: "4px 0" }}>{run.runName}</h1>
          <div style={{ color: "var(--muted)", fontSize: 14 }}>
            {run.company.companyName} · Review {shortDate(run.reviewDate)} · Window {shortDate(run.fundingWindowStart)} → {shortDate(run.fundingWindowEnd)} · <strong style={{ color: "var(--text)" }}>{run.runStatus}</strong>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ImportRseButton runId={run.id} />
          <CalculateButton runId={run.id} />
        </div>
      </header>

      <section
        style={{
          marginTop: 16,
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "14px 18px",
          fontSize: 13,
        }}
      >
        <strong>RSE handoff:</strong>{" "}
        {run._count.purchaseCandidates === 0 ? (
          <>
            No purchase candidates yet. Approve lines in RSE PRE (status{" "}
            <em>Ready for IFM Review</em>), then click <strong>Import from RSE</strong>.
          </>
        ) : (
          <>
            {run._count.purchaseCandidates} purchase candidate(s) loaded.
            {run._count.cashPositions === 0 && (
              <> Add cash in Prisma Studio (<code>npm run db:studio</code>) before Recalculate.</>
            )}
            {run._count.cashPositions > 0 && <> Click <strong>Recalculate</strong> for funding decisions.</>}
          </>
        )}
      </section>

      {/* Warning banners — Document 5 §8 */}
      <section style={{ marginTop: 18, display: "grid", gap: 8 }}>
        {banners.map((b, i) => (
          <div
            key={i}
            style={{
              borderLeft: `4px solid ${BANNER_COLOR[b.level]}`,
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderLeftWidth: 4,
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
            }}
          >
            {b.text}
          </div>
        ))}
      </section>

      {/* Capacity — Document 4 funding layers */}
      <section style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <Card label="Core available funding" value={usd(fc?.coreAvailableInventoryFunding)} hint={`Allocatable ${usd(coreAllocatable)} after ${usd(holdback)} holdback`} />
        <Card label="Supplemental capacity" value={usd(fc?.supplementalFundingCapacity)} hint="LOC + factoring, approval required" />
        <Card label="Total potential funding" value={usd(fc?.totalPotentialInventoryFunding)} hint="Core + supplemental" />
        <Card label="Requested vs recommended" value={usd(totalRecommended)} hint={`of ${usd(totalRequested)} requested`} />
      </section>

      {/* Company financing profile */}
      <CompanyFinancingPanel
        companyId={run.companyId}
        settings={{
          runwayWeeks: settings?.runwayWeeks ?? 13,
          protectedCashReserve: settings?.protectedCashReserve ?? 0,
          factoringActive: settings?.factoringActive ?? false,
          factoringAdvanceRate: settings?.factoringAdvanceRate ?? 0.8,
          factoringReserveRate: settings?.factoringReserveRate ?? 0.2,
          factoringAdvanceLagDays: settings?.factoringAdvanceLagDays ?? 1,
          typicalCustomerPayDays: settings?.typicalCustomerPayDays ?? 30,
          collectionLagDays: settings?.collectionLagDays ?? 0,
          chargebackTriggerType: settings?.chargebackTriggerType ?? null,
          chargebackTriggerDays: settings?.chargebackTriggerDays ?? null,
          locActive: settings?.locActive ?? false,
        }}
      />

      {/* Management funding adjustment */}
      <FundingAdjustmentPanel
        runId={run.id}
        manualCashAddition={run.manualCashAddition}
        manualCashReduction={run.manualCashReduction}
        fundingAdjustmentNote={run.fundingAdjustmentNote}
      />

      {/* Core funding breakdown — Document 4 §4 */}
      {fc && (
        <section style={{ marginTop: 14, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px" }}>
          <div style={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
            Core funding calculation
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 13 }}>
            <span>Cash {usd(fc.cashOnHand)}</span>
            <span style={{ color: "var(--good)" }}>+ Inflows {usd(fc.confidentExpectedInflows)}</span>
            {(fc.manualCashAdditions > 0 || run.manualCashAddition > 0) && (
              <span style={{ color: "var(--good)" }}>+ Manual addition {usd(fc.manualCashAdditions || run.manualCashAddition)}</span>
            )}
            {(fc.manualCashReductions > 0 || run.manualCashReduction > 0) && (
              <span style={{ color: "var(--bad)" }}>− Manual reduction {usd(fc.manualCashReductions || run.manualCashReduction)}</span>
            )}
            <span style={{ color: "var(--bad)" }}>− Reserve {usd(fc.protectedCashReserve)}</span>
            <span style={{ color: "var(--bad)" }}>− Outflows {usd(fc.requiredOutflowsTotal)}</span>
            <span style={{ color: "var(--bad)" }}>− AP pressure {usd(fc.apPressureTotal)}</span>
            <span style={{ color: "var(--bad)" }}>− Open PO exposure {usd(fc.openPoExposureTotal)}</span>
            <span style={{ fontWeight: 700 }}>= Core {usd(fc.coreAvailableInventoryFunding)}</span>
          </div>
          {run.fundingAdjustmentNote && (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
              Adjustment note: {run.fundingAdjustmentNote}
            </div>
          )}
        </section>
      )}

      {!fc && (run.manualCashAddition > 0 || run.manualCashReduction > 0) && (
        <section style={{ marginTop: 14, fontSize: 13, color: "var(--muted)" }}>
          Manual adjustment saved ({usd(run.manualCashAddition)} addition). Recalculate to apply.
          {run.fundingAdjustmentNote && <> Note: {run.fundingAdjustmentNote}</>}
        </section>
      )}

      {termsPendingCount > 0 && (
        <section
          style={{
            marginTop: 14,
            borderLeft: "4px solid var(--warn)",
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
          }}
        >
          <strong>{termsPendingCount} line(s)</strong> have vendor terms pending in RSE. Import is allowed;
          <strong> Approve for PO is blocked</strong> until buyer confirms or overrides terms per vendor batch.
        </section>
      )}

      {runway && (
        <CashRunwayPanel
          runwayWeeks={runwayWeeks}
          minCashBalance={runway.minCashBalance}
          minCashWeekIndex={runway.minCashWeekIndex}
          belowReserveFlag={runway.belowReserveFlag}
          protectedReserve={settings?.protectedCashReserve ?? 0}
          weeks={JSON.parse(runway.weeksJson)}
          tailCommitments={JSON.parse(runway.tailCommitmentsJson)}
          termsPendingCount={termsPendingCount}
        />
      )}

      {/* Purchase Funding Decision Board — Document 6 §5 */}
      {rows.length === 0 ? (
        <section style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 18 }}>Purchase Funding Decision Board</h2>
          <p style={{ color: "var(--muted)" }}>No calculated decisions yet. Use Recalculate to run the funding engine.</p>
        </section>
      ) : (
        <DecisionBoard
          runId={run.id}
          ownerApprovalThreshold={ownerApprovalThreshold}
          itemRows={itemRows}
          vendorRows={vendorRows}
          handoffSummary={handoffSummary}
        />
      )}

      {/* Export Center — Document 6 */}
      <section style={{ marginTop: 26 }}>
        <h2 style={{ fontSize: 18 }}>Export Center</h2>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
          CSV exports are review-only. Keystroke import-ready files must be tab-delimited .txt — CSV/XLSX
          can never be labeled import-ready.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {([
            { type: "po-handoff", label: "PO Writer Handoff" },
            { type: "decision", label: "Purchase Funding Decision" },
            { type: "funding-summary", label: "Funding Summary" },
            { type: "allocation", label: "Funding Allocation" },
            { type: "vendor-offer", label: "Vendor Offers" },
            { type: "data-gap", label: "Data Gaps" },
          ] as const).map((e) => (
            <a
              key={e.type}
              href={`/api/runs/${run.id}/export?type=${e.type}&format=csv`}
              style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 13 }}
            >
              ↓ {e.label} (.csv)
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
