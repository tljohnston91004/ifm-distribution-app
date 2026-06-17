"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { usd } from "@/lib/format";
import type { VendorSummaryRow } from "@/lib/ifm/vendor-summary";

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
const td: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid var(--border)",
  fontSize: 13,
  verticalAlign: "top",
};

const approveBtn: React.CSSProperties = {
  background: "var(--good)",
  color: "#04122a",
  border: "none",
  borderRadius: 6,
  padding: "6px 10px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 12,
  whiteSpace: "nowrap",
};

const overrideBtn: React.CSSProperties = {
  ...approveBtn,
  background: "transparent",
  color: "var(--warn)",
  border: "1px solid var(--warn)",
  marginTop: 4,
};

function decisionColor(label: string): string {
  if (/Approve\b/.test(label) || label === "Take Full Vendor Offer") return "var(--good)";
  if (/Decline|Hold|Delay|Mixed/.test(label)) return "var(--bad)";
  return "var(--warn)";
}

export interface ItemRow {
  id: string;
  decisionId: string;
  priority: number | string;
  vendorName: string;
  sku: string;
  source: string;
  requested: number;
  recommended: number;
  unfunded: number;
  decision: string;
  fundingSource: string;
  approval: string;
  reason: string;
  reviewerApproved: boolean;
  approvedAmount: number;
  decisionStatus: string;
  canReviewerApprove: boolean;
  canOverrideApprove: boolean;
  needsOwnerSignOff: boolean;
}

interface PendingOverride {
  decisionIds: string[];
  label: string;
  defaultAmount: number;
  maxAmount: number;
  perLine: boolean;
  lineAmounts?: Record<string, number>;
}

interface DecisionBoardProps {
  runId: string;
  ownerApprovalThreshold: number;
  itemRows: ItemRow[];
  vendorRows: VendorSummaryRow[];
  handoffSummary: {
    approvedLines: number;
    approvedDollars: number;
  };
}

export default function DecisionBoard({
  runId,
  ownerApprovalThreshold,
  itemRows,
  vendorRows,
  handoffSummary,
}: DecisionBoardProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"vendor" | "item">("vendor");
  const [loading, setLoading] = useState<string | null>(null);
  const [pendingOverride, setPendingOverride] = useState<PendingOverride | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideAmount, setOverrideAmount] = useState("");
  const [ownerConfirm, setOwnerConfirm] = useState(false);

  async function approveDecisions(
    decisionIds: string[],
    label: string,
    opts?: { override?: boolean; reason?: string; ownerConfirm?: boolean; amounts?: Record<string, number> },
  ) {
    setLoading(label);
    try {
      const res = await fetch(`/api/runs/${runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionIds,
          override: opts?.override,
          overrideReason: opts?.reason,
          ownerConfirm: opts?.ownerConfirm,
          amounts: opts?.amounts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Approval failed");

      const parts = [
        opts?.override
          ? `Override approved ${data.approved} line(s) (${data.overrideCount ?? 0} beyond system recommendation).`
          : `Approved ${data.approved} line(s) in IFM (${data.totalApprovedDollars?.toLocaleString("en-US", { style: "currency", currency: "USD" }) ?? ""}).`,
      ];
      if (data.rseUpdated > 0) {
        parts.push(
          `RSE updated: ${data.rseUpdated} line(s) marked IFM Reviewed — PO creator can export from RSE Export Center.`,
        );
      }
      if (data.rseFailed > 0) parts.push(`RSE sync failed for ${data.rseFailed} line(s).`);
      if (data.rseSkipped > 0) parts.push(`${data.rseSkipped} line(s) had no RSE link (not imported from RSE).`);
      if (data.skipped > 0) parts.push(`${data.skipped} line(s) skipped.`);
      alert(parts.join("\n\n"));
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setLoading(null);
      setPendingOverride(null);
      setOverrideReason("");
      setOverrideAmount("");
      setOwnerConfirm(false);
    }
  }

  function openOverride(pending: PendingOverride) {
    setPendingOverride(pending);
    setOverrideReason("");
    setOverrideAmount(String(pending.defaultAmount));
    setOwnerConfirm(false);
  }

  function submitOverride() {
    if (!pendingOverride) return;
    const reason = overrideReason.trim();
    if (reason.length < 8) {
      alert("Override reason must be at least 8 characters.");
      return;
    }
    const amountNum = Number(overrideAmount);
    const needsOwner =
      amountNum >= ownerApprovalThreshold ||
      pendingOverride.decisionIds.some((id) => itemRows.find((r) => r.decisionId === id)?.needsOwnerSignOff);
    if (needsOwner && !ownerConfirm) {
      alert(`Owner sign-off required for amounts at or above ${usd(ownerApprovalThreshold)}. Check the box and retry.`);
      return;
    }

    const amounts: Record<string, number> | undefined =
      pendingOverride.perLine && pendingOverride.lineAmounts
        ? pendingOverride.lineAmounts
        : pendingOverride.decisionIds.length === 1
          ? { [pendingOverride.decisionIds[0]]: amountNum }
          : undefined;

    void approveDecisions(pendingOverride.decisionIds, pendingOverride.label, {
      override: true,
      reason,
      ownerConfirm,
      amounts,
    });
  }

  const tabBtn = (id: "vendor" | "item", label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      style={{
        background: tab === id ? "var(--accent)" : "var(--panel)",
        color: tab === id ? "#04122a" : "var(--text)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "8px 14px",
        fontWeight: 600,
        cursor: "pointer",
        fontSize: 13,
      }}
    >
      {label}
    </button>
  );

  const overrideAmountNum = Number(overrideAmount) || 0;
  const overrideNeedsOwner =
    pendingOverride &&
    (overrideAmountNum >= ownerApprovalThreshold ||
      pendingOverride.decisionIds.some((id) => itemRows.find((r) => r.decisionId === id)?.needsOwnerSignOff));

  return (
    <section style={{ marginTop: 26 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>Purchase Funding Decision Board</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {tabBtn("vendor", `By vendor (${vendorRows.length})`)}
          {tabBtn("item", `By item (${itemRows.length})`)}
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          background: "rgba(62,207,142,0.08)",
          border: "1px solid rgba(62,207,142,0.25)",
          borderRadius: 10,
          padding: "12px 16px",
          fontSize: 13,
        }}
      >
        <strong>PO writer handoff:</strong> <strong>Approve for PO</strong> follows the system recommendation.
        <strong> Override approve</strong> lets management approve specific lines (including unfunded) with a documented
        reason — use after adding manual funding above, or when judgment beats the allocator. Updates RSE for export.
        {handoffSummary.approvedLines > 0 && (
          <>
            {" "}
            Currently approved: <strong>{handoffSummary.approvedLines} line(s)</strong>,{" "}
            <strong>{usd(handoffSummary.approvedDollars)}</strong>.
          </>
        )}
      </div>

      {pendingOverride && (
        <div
          style={{
            marginTop: 12,
            background: "rgba(255,193,7,0.08)",
            border: "1px solid rgba(255,193,7,0.35)",
            borderRadius: 10,
            padding: "14px 16px",
            fontSize: 13,
          }}
        >
          <strong>Override approve — {pendingOverride.label}</strong>
          <p style={{ margin: "8px 0", color: "var(--muted)" }}>
            Approves beyond (or without) system funding. Reason is stored on the decision for audit.
          </p>
          {pendingOverride.decisionIds.length === 1 && (
            <label style={{ display: "block", marginBottom: 10 }}>
              <span style={{ color: "var(--muted)" }}>Approved amount (max {usd(pendingOverride.maxAmount)})</span>
              <input
                type="number"
                min={0}
                max={pendingOverride.maxAmount}
                step={0.01}
                value={overrideAmount}
                onChange={(e) => setOverrideAmount(e.target.value)}
                style={{
                  display: "block",
                  width: "100%",
                  maxWidth: 220,
                  marginTop: 4,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              />
            </label>
          )}
          {pendingOverride.decisionIds.length > 1 && (
            <p style={{ margin: "0 0 10px" }}>
              Batch override: each line approved at full requested amount (
              {pendingOverride.decisionIds.length} line(s)).
            </p>
          )}
          <label style={{ display: "block", marginBottom: 10 }}>
            <span style={{ color: "var(--muted)" }}>Reason (required)</span>
            <input
              type="text"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g. Approved against expected $250k investment — owner confirmed"
              style={{
                display: "block",
                width: "100%",
                marginTop: 4,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
              }}
            />
          </label>
          {overrideNeedsOwner && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <input type="checkbox" checked={ownerConfirm} onChange={(e) => setOwnerConfirm(e.target.checked)} />
              Owner / executive sign-off (required at or above {usd(ownerApprovalThreshold)})
            </label>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={approveBtn} disabled={!!loading} onClick={submitOverride}>
              {loading === pendingOverride.label ? "Approving…" : "Confirm override"}
            </button>
            <button
              type="button"
              style={{ ...overrideBtn, marginTop: 0 }}
              disabled={!!loading}
              onClick={() => setPendingOverride(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>
        {tab === "vendor"
          ? "Funding decision is IFM's recommendation. Override when management accepts funding risk the engine cannot see."
          : "Item view for line-level review before approving."}
      </p>

      {tab === "vendor" ? (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12, marginTop: 12 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1000 }}>
            <thead>
              <tr>
                <th style={th}>Priority</th>
                <th style={th}>Vendor</th>
                <th style={th}>Funding decision</th>
                <th style={th}>SKUs</th>
                <th style={th}>Requested</th>
                <th style={th}>Recommended</th>
                <th style={th}>Approved for PO</th>
                <th style={th}>Unfunded</th>
                <th style={th}>Funding source</th>
                <th style={th}>Reviewer action</th>
              </tr>
            </thead>
            <tbody>
              {vendorRows.map((v) => (
                <tr key={v.vendorName}>
                  <td style={td}>{v.minPriority}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{v.vendorName}</td>
                  <td style={{ ...td, color: decisionColor(v.topDecision), fontWeight: 600 }}>{v.topDecision}</td>
                  <td style={td}>{v.skuCount}</td>
                  <td style={td}>{usd(v.requestedTotal)}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{usd(v.recommendedTotal)}</td>
                  <td style={{ ...td, fontWeight: 600, color: v.reviewerApprovedTotal > 0 ? "var(--good)" : "var(--muted)" }}>
                    {v.reviewerApprovedTotal > 0 ? usd(v.reviewerApprovedTotal) : "—"}
                  </td>
                  <td style={td}>{usd(v.unfundedTotal)}</td>
                  <td style={td}>{v.fundingSources.join(", ") || "Not Funded"}</td>
                  <td style={td}>
                    {v.reviewerApprovedSkuCount === v.skuCount && v.reviewerApprovedTotal > 0 ? (
                      <span style={{ color: "var(--good)", fontWeight: 600 }}>Approved</span>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                        {v.canReviewerApprove && (
                          <button
                            type="button"
                            style={{ ...approveBtn, opacity: loading === v.vendorName ? 0.6 : 1 }}
                            disabled={!!loading}
                            onClick={() => approveDecisions(v.decisionIds, v.vendorName)}
                          >
                            {loading === v.vendorName ? "Approving…" : "Approve for PO"}
                          </button>
                        )}
                        {v.canOverrideApprove && v.overrideDecisionIds.length > 0 && (
                          <button
                            type="button"
                            style={{ ...overrideBtn, opacity: loading === `override-${v.vendorName}` ? 0.6 : 1 }}
                            disabled={!!loading}
                            onClick={() =>
                              openOverride({
                                decisionIds: v.overrideDecisionIds,
                                label: v.vendorName,
                                defaultAmount: v.requestedTotal,
                                maxAmount: v.requestedTotal,
                                perLine: true,
                                lineAmounts: Object.fromEntries(
                                  itemRows
                                    .filter((r) => v.overrideDecisionIds.includes(r.decisionId))
                                    .map((r) => [r.decisionId, r.requested]),
                                ),
                              })
                            }
                          >
                            Override approve
                          </button>
                        )}
                        {!v.canReviewerApprove && !v.canOverrideApprove && v.needsOwnerApproval && "Needs owner"}
                        {!v.canReviewerApprove && !v.canOverrideApprove && v.needsFinancingApproval && "Needs financing"}
                        {!v.canReviewerApprove && !v.canOverrideApprove && !v.needsOwnerApproval && !v.needsFinancingApproval && "—"}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12, marginTop: 12 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={th}>#</th>
                <th style={th}>Vendor</th>
                <th style={th}>Source</th>
                <th style={th}>Requested</th>
                <th style={th}>Recommended</th>
                <th style={th}>Approved for PO</th>
                <th style={th}>Delayed / Unfunded</th>
                <th style={th}>Funding decision</th>
                <th style={th}>Funding Source</th>
                <th style={th}>Reviewer action</th>
              </tr>
            </thead>
            <tbody>
              {itemRows.map((row) => (
                <tr key={row.id}>
                  <td style={td}>{row.priority}</td>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{row.vendorName}</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>{row.sku}</div>
                  </td>
                  <td style={td}>{row.source}</td>
                  <td style={td}>{usd(row.requested)}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{usd(row.recommended)}</td>
                  <td style={{ ...td, fontWeight: 600, color: row.reviewerApproved ? "var(--good)" : "var(--muted)" }}>
                    {row.reviewerApproved ? (
                      <>
                        {usd(row.approvedAmount)}
                        {row.decisionStatus === "Owner" && (
                          <div style={{ fontSize: 11, color: "var(--warn)" }}>Owner sign-off</div>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={td}>{usd(row.unfunded)}</td>
                  <td style={{ ...td, color: decisionColor(row.decision), fontWeight: 600 }}>{row.decision}</td>
                  <td style={td}>{row.fundingSource}</td>
                  <td style={td}>
                    {row.reviewerApproved ? (
                      <span style={{ color: "var(--good)", fontWeight: 600 }}>Approved</span>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                        {row.canReviewerApprove && row.recommended > 0 && (
                          <button
                            type="button"
                            style={{ ...approveBtn, opacity: loading === row.decisionId ? 0.6 : 1 }}
                            disabled={!!loading}
                            onClick={() => approveDecisions([row.decisionId], row.decisionId)}
                          >
                            {loading === row.decisionId ? "Approving…" : "Approve for PO"}
                          </button>
                        )}
                        {row.canOverrideApprove && (
                          <button
                            type="button"
                            style={{ ...overrideBtn, opacity: loading === `override-${row.decisionId}` ? 0.6 : 1 }}
                            disabled={!!loading}
                            onClick={() =>
                              openOverride({
                                decisionIds: [row.decisionId],
                                label: `${row.vendorName} / ${row.sku}`,
                                defaultAmount: row.requested,
                                maxAmount: row.requested,
                                perLine: false,
                              })
                            }
                          >
                            Override approve
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
