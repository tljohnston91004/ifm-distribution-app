"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function nextMonday(from = new Date()): Date {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  return d;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

const monday = nextMonday();
const windowEnd = addDays(monday, 30);

const field: React.CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "9px 12px",
  color: "var(--text)",
  width: "100%",
};
const labelStyle: React.CSSProperties = { fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 };

export default function NewRunPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    runName: `Weekly Funding Review — ${isoDate(monday)}`,
    reviewDate: isoDate(monday),
    fundingWindowStart: isoDate(monday),
    fundingWindowEnd: isoDate(windowEnd),
    reviewCadence: "weekly",
    protectedCashReserve: 250000,
    ownerApprovalThreshold: 40000,
    emergencyHoldbackAmount: 10000,
    vendorConcentrationLimit: 0.4,
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px" }}>
      <Link href="/" style={{ fontSize: 13, color: "var(--muted)" }}>← All runs</Link>
      <h1 style={{ fontSize: 24, margin: "8px 0 4px" }}>New IFM Run Setup</h1>
      <p style={{ color: "var(--muted)", marginTop: 0, fontSize: 14 }}>
        Company, run name, review date (typically Monday), funding window, reserve, and thresholds.
        After create, use the <strong>Data Upload Center</strong> for financial and POS files, then import from RSE.
      </p>

      <form
        style={{ display: "grid", gap: 14, marginTop: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          try {
            const res = await fetch("/api/runs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(form),
            });
            const data = await res.json();
            if (data.runId) router.push(`/runs/${data.runId}`);
            else throw new Error(data.error ?? "Create failed");
          } catch (err) {
            alert(err instanceof Error ? err.message : "Create failed");
            setLoading(false);
          }
        }}
      >
        <div><label style={labelStyle}>Company name</label><input style={field} value={form.companyName} onChange={set("companyName")} required placeholder="e.g. Acme Distribution" /></div>
        <div><label style={labelStyle}>Run name</label><input style={field} value={form.runName} onChange={set("runName")} required /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div><label style={labelStyle}>Review date</label><input style={field} type="date" value={form.reviewDate} onChange={set("reviewDate")} /></div>
          <div><label style={labelStyle}>Window start</label><input style={field} type="date" value={form.fundingWindowStart} onChange={set("fundingWindowStart")} /></div>
          <div><label style={labelStyle}>Window end</label><input style={field} type="date" value={form.fundingWindowEnd} onChange={set("fundingWindowEnd")} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={labelStyle}>Protected cash reserve ($)</label><input style={field} type="number" value={form.protectedCashReserve} onChange={set("protectedCashReserve")} /></div>
          <div><label style={labelStyle}>Owner approval threshold ($)</label><input style={field} type="number" value={form.ownerApprovalThreshold} onChange={set("ownerApprovalThreshold")} /></div>
          <div><label style={labelStyle}>Emergency holdback ($)</label><input style={field} type="number" value={form.emergencyHoldbackAmount} onChange={set("emergencyHoldbackAmount")} /></div>
          <div><label style={labelStyle}>Vendor concentration limit (0–1)</label><input style={field} type="number" step="0.05" value={form.vendorConcentrationLimit} onChange={set("vendorConcentrationLimit")} /></div>
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{ background: "var(--accent)", color: "#04122a", border: "none", borderRadius: 8, padding: "11px 16px", fontWeight: 600, cursor: "pointer", opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Creating…" : "Create run"}
        </button>
      </form>
    </main>
  );
}
