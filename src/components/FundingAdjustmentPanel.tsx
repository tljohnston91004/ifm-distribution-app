"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { usd } from "@/lib/format";

interface FundingAdjustmentPanelProps {
  runId: string;
  manualCashAddition: number;
  manualCashReduction: number;
  fundingAdjustmentNote: string | null;
}

export default function FundingAdjustmentPanel({
  runId,
  manualCashAddition: initialAddition,
  manualCashReduction: initialReduction,
  fundingAdjustmentNote: initialNote,
}: FundingAdjustmentPanelProps) {
  const router = useRouter();
  const [addition, setAddition] = useState(String(initialAddition || ""));
  const [reduction, setReduction] = useState(String(initialReduction || ""));
  const [note, setNote] = useState(initialNote ?? "");
  const [loading, setLoading] = useState(false);

  async function save(recalculate: boolean) {
    setLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}/funding-adjustment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manualCashAddition: Number(addition) || 0,
          manualCashReduction: Number(reduction) || 0,
          fundingAdjustmentNote: note.trim() || null,
          recalculate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");

      const msg = recalculate
        ? "Funding adjustment saved and run recalculated. Review newly funded lines on the decision board."
        : "Funding adjustment saved. Click Recalculate to apply to purchase allocations.";
      alert(msg);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  const additionNum = Number(addition) || 0;

  return (
    <section
      style={{
        marginTop: 14,
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Management funding adjustment</div>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "6px 0 0", maxWidth: 640 }}>
            Add cash the system does not know about yet (expected investment, owner injection, etc.).
            This feeds the core funding formula before allocation. Use <strong>Override approve</strong> on
            the board when you need specific lines beyond what recalculation funds.
          </p>
        </div>
        {(initialAddition > 0 || initialReduction > 0) && (
          <div style={{ fontSize: 13, color: "var(--good)", fontWeight: 600 }}>
            Active: {initialAddition > 0 && `+${usd(initialAddition)}`}
            {initialReduction > 0 && ` −${usd(initialReduction)}`}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 14 }}>
        <label style={{ fontSize: 13 }}>
          <div style={{ color: "var(--muted)", marginBottom: 4 }}>Manual cash addition</div>
          <input
            type="number"
            min={0}
            step={1000}
            value={addition}
            onChange={(e) => setAddition(e.target.value)}
            placeholder="0"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
        </label>
        <label style={{ fontSize: 13 }}>
          <div style={{ color: "var(--muted)", marginBottom: 4 }}>Manual cash reduction</div>
          <input
            type="number"
            min={0}
            step={1000}
            value={reduction}
            onChange={(e) => setReduction(e.target.value)}
            placeholder="0"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
        </label>
        <label style={{ fontSize: 13, gridColumn: "1 / -1" }}>
          <div style={{ color: "var(--muted)", marginBottom: 4 }}>
            Note {additionNum > 0 && <span style={{ color: "var(--warn)" }}>(required for additions)</span>}
          </div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. $250k equity injection expected 6/20 — not in Keystroke yet"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={loading}
          onClick={() => save(true)}
          style={{
            background: "var(--accent)",
            color: "#04122a",
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Saving…" : "Save & recalculate"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => save(false)}
          style={{
            background: "transparent",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "8px 14px",
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          Save only
        </button>
      </div>
    </section>
  );
}
