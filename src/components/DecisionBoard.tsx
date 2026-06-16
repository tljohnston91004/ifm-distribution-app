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
  canReviewerApprove: boolean;
}

interface DecisionBoardProps {
  runId: string;
  itemRows: ItemRow[];
  vendorRows: VendorSummaryRow[];
  handoffSummary: {
    approvedLines: number;
    approvedDollars: number;
  };
}

export default function DecisionBoard({ runId, itemRows, vendorRows, handoffSummary }: DecisionBoardProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"vendor" | "item">("vendor");
  const [loading, setLoading] = useState<string | null>(null);

  async function approveDecisions(decisionIds: string[], label: string) {
    setLoading(label);
    try {
      const res = await fetch(`/api/runs/${runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Approval failed");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setLoading(null);
    }
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
        <strong>PO writer handoff:</strong> Click <strong>Approve for PO</strong> on each vendor (or line) you want
        funded. Then download{" "}
        <a href={`/api/runs/${runId}/export?type=po-handoff&format=csv`} style={{ color: "var(--accent)" }}>
          PO Writer Handoff (.csv)
        </a>{" "}
        — it lists approved vendor, SKU, qty, and dollar amount for the person writing POs in Keystroke.
        {handoffSummary.approvedLines > 0 && (
          <>
            {" "}
            Currently approved: <strong>{handoffSummary.approvedLines} line(s)</strong>,{" "}
            <strong>{usd(handoffSummary.approvedDollars)}</strong>.
          </>
        )}
      </div>

      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>
        {tab === "vendor"
          ? "Funding decision is IFM's recommendation. Approve for PO records your sign-off and creates the handoff file."
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
                    ) : v.canReviewerApprove ? (
                      <button
                        type="button"
                        style={{ ...approveBtn, opacity: loading === v.vendorName ? 0.6 : 1 }}
                        disabled={loading === v.vendorName}
                        onClick={() => approveDecisions(v.decisionIds, v.vendorName)}
                      >
                        {loading === v.vendorName ? "Approving…" : "Approve for PO"}
                      </button>
                    ) : v.needsOwnerApproval ? (
                      "Needs owner"
                    ) : v.needsFinancingApproval ? (
                      "Needs financing"
                    ) : (
                      "No funded lines"
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
                    {row.reviewerApproved ? usd(row.approvedAmount) : "—"}
                  </td>
                  <td style={td}>{usd(row.unfunded)}</td>
                  <td style={{ ...td, color: decisionColor(row.decision), fontWeight: 600 }}>{row.decision}</td>
                  <td style={td}>{row.fundingSource}</td>
                  <td style={td}>
                    {row.reviewerApproved ? (
                      <span style={{ color: "var(--good)", fontWeight: 600 }}>Approved</span>
                    ) : row.canReviewerApprove && row.recommended > 0 ? (
                      <button
                        type="button"
                        style={{ ...approveBtn, opacity: loading === row.decisionId ? 0.6 : 1 }}
                        disabled={loading === row.decisionId}
                        onClick={() => approveDecisions([row.decisionId], row.decisionId)}
                      >
                        {loading === row.decisionId ? "Approving…" : "Approve for PO"}
                      </button>
                    ) : row.approval === "Owner" ? (
                      "Needs owner"
                    ) : row.approval === "Financing" ? (
                      "Needs financing"
                    ) : (
                      "—"
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
