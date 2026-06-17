"use client";

import { usd } from "@/lib/format";

interface RunwayWeek {
  weekIndex: number;
  weekStart: string;
  weekEnd: string;
  openingBalance: number;
  inflows: number;
  outflows: number;
  closingBalance: number;
  events: string[];
}

interface TailCommitment {
  candidateId: string;
  vendorName: string;
  sku: string | null;
  remainingAmount: number;
  installmentCount: number;
  terms: string;
}

interface CashRunwayPanelProps {
  runwayWeeks: number;
  minCashBalance: number;
  minCashWeekIndex: number;
  belowReserveFlag: boolean;
  protectedReserve: number;
  weeks: RunwayWeek[];
  tailCommitments: TailCommitment[];
  termsPendingCount: number;
}

export default function CashRunwayPanel({
  runwayWeeks,
  minCashBalance,
  minCashWeekIndex,
  belowReserveFlag,
  protectedReserve,
  weeks,
  tailCommitments,
  termsPendingCount,
}: CashRunwayPanelProps) {
  return (
    <section
      style={{
        marginTop: 14,
        background: "var(--panel)",
        border: `1px solid ${belowReserveFlag ? "var(--bad)" : "var(--border)"}`,
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 15 }}>13-week cash runway (purchase payment schedule)</div>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "6px 0 12px" }}>
        Projects cash using confirmed order terms, sell-through by class, and company factoring settings. IFM approval
        is blocked while {termsPendingCount > 0 ? `${termsPendingCount} line(s) have` : "lines have"} pending terms in
        RSE.
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, marginBottom: 12 }}>
        <span>Horizon: <strong>{runwayWeeks} weeks</strong></span>
        <span>
          Min cash: <strong style={{ color: belowReserveFlag ? "var(--bad)" : "var(--text)" }}>{usd(minCashBalance)}</strong>{" "}
          (week {minCashWeekIndex})
        </span>
        <span>Reserve floor: <strong>{usd(protectedReserve)}</strong></span>
        {belowReserveFlag && (
          <span style={{ color: "var(--bad)", fontWeight: 600 }}>Below reserve in horizon</span>
        )}
        {termsPendingCount > 0 && (
          <span style={{ color: "var(--warn)", fontWeight: 600 }}>{termsPendingCount} terms pending in RSE</span>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640, fontSize: 12 }}>
          <thead>
            <tr>
              {["Week", "Period", "Opening", "In", "Out", "Closing"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "6px 8px",
                    borderBottom: "1px solid var(--border)",
                    color: "var(--muted)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.weekIndex}>
                <td style={td}>{w.weekIndex}</td>
                <td style={td}>
                  {w.weekStart} → {w.weekEnd}
                </td>
                <td style={td}>{usd(w.openingBalance)}</td>
                <td style={{ ...td, color: "var(--good)" }}>{w.inflows > 0 ? usd(w.inflows) : "—"}</td>
                <td style={{ ...td, color: "var(--bad)" }}>{w.outflows > 0 ? usd(w.outflows) : "—"}</td>
                <td style={{ ...td, fontWeight: 600 }}>{usd(w.closingBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tailCommitments.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12 }}>
          <strong>Beyond {runwayWeeks}-week tail commitments:</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {tailCommitments.map((t) => (
              <li key={t.candidateId}>
                {t.vendorName} {t.sku ?? ""}: {usd(t.remainingAmount)} ({t.installmentCount} payments, {t.terms})
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const td: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid var(--border)",
};
