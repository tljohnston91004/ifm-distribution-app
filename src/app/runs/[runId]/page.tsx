import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CalculateButton } from "@/components/RunActions";
import { buildBanners } from "@/lib/ifm/banners";
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

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "var(--muted)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = { padding: "10px 10px", borderBottom: "1px solid var(--border)", fontSize: 13, verticalAlign: "top" };

function decisionColor(label: string): string {
  if (/Approve\b/.test(label) || label === "Take Full Vendor Offer") return "var(--good)";
  if (/Decline|Hold|Delay/.test(label)) return "var(--bad)";
  return "var(--warn)";
}

export default async function RunWorkspace({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = await prisma.ifmRun.findUnique({
    where: { id: runId },
    include: {
      company: { include: { reviewSettings: true } },
      fundingCalculation: true,
      supplementalCalc: true,
      fundingAllocations: true,
      dataGaps: true,
      purchaseDecisions: { include: { candidate: true }, orderBy: { id: "asc" } },
    },
  });
  if (!run) notFound();

  const fc = run.fundingCalculation;
  const settings = run.company.reviewSettings[0];
  const holdback = settings?.emergencyHoldbackAmount ?? 0;
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
        <CalculateButton runId={run.id} />
      </header>

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

      {/* Core funding breakdown — Document 4 §4 */}
      {fc && (
        <section style={{ marginTop: 14, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px" }}>
          <div style={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
            Core funding calculation
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 13 }}>
            <span>Cash {usd(fc.cashOnHand)}</span>
            <span style={{ color: "var(--good)" }}>+ Inflows {usd(fc.confidentExpectedInflows)}</span>
            <span style={{ color: "var(--bad)" }}>− Reserve {usd(fc.protectedCashReserve)}</span>
            <span style={{ color: "var(--bad)" }}>− Outflows {usd(fc.requiredOutflowsTotal)}</span>
            <span style={{ color: "var(--bad)" }}>− AP pressure {usd(fc.apPressureTotal)}</span>
            <span style={{ color: "var(--bad)" }}>− Open PO exposure {usd(fc.openPoExposureTotal)}</span>
            <span style={{ fontWeight: 700 }}>= Core {usd(fc.coreAvailableInventoryFunding)}</span>
          </div>
        </section>
      )}

      {/* Purchase Funding Decision Board — Document 6 §5 */}
      <section style={{ marginTop: 26 }}>
        <h2 style={{ fontSize: 18 }}>Purchase Funding Decision Board</h2>
        {rows.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No calculated decisions yet. Use Recalculate to run the funding engine.</p>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1000 }}>
              <thead>
                <tr>
                  <th style={th}>#</th>
                  <th style={th}>Vendor</th>
                  <th style={th}>Source</th>
                  <th style={th}>Requested</th>
                  <th style={th}>Recommended</th>
                  <th style={th}>Delayed / Unfunded</th>
                  <th style={th}>IFM Decision</th>
                  <th style={th}>Funding Source</th>
                  <th style={th}>Approval</th>
                  <th style={th}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ dn, alloc }) => {
                  const approval = dn.ownerApprovalRequired
                    ? "Owner"
                    : dn.financingApprovalRequired
                    ? "Financing"
                    : "Reviewer";
                  const unfunded = (alloc?.unfundedAmount ?? 0) + dn.delayedAmount + dn.excludedAmount;
                  return (
                    <tr key={dn.id}>
                      <td style={td}>{alloc?.allocationPriority ?? "—"}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{dn.candidate.vendorName}</div>
                        <div style={{ color: "var(--muted)", fontSize: 12 }}>{dn.candidate.skuOrItemId ?? dn.candidate.needReason}</div>
                      </td>
                      <td style={td}>{dn.candidate.sourceOfRequest}</td>
                      <td style={td}>{usd(dn.candidate.estimatedTotalCost)}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{usd(alloc?.allocatedAmount ?? 0)}</td>
                      <td style={td}>{usd(unfunded)}</td>
                      <td style={{ ...td, color: decisionColor(dn.systemDecisionLabel), fontWeight: 600 }}>{dn.systemDecisionLabel}</td>
                      <td style={td}>{alloc?.fundingSource ?? "Not Funded"}</td>
                      <td style={td}>{approval}</td>
                      <td style={{ ...td, color: "var(--muted)", maxWidth: 260 }}>{dn.decisionReason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Export Center — Document 6 */}
      <section style={{ marginTop: 26 }}>
        <h2 style={{ fontSize: 18 }}>Export Center</h2>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
          CSV exports are review-only. Keystroke import-ready files must be tab-delimited .txt — CSV/XLSX
          can never be labeled import-ready.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {([
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
