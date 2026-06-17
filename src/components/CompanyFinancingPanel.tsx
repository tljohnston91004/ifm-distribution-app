"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface CompanyFinancingPanelProps {
  companyId: string;
  settings: {
    runwayWeeks: number;
    protectedCashReserve: number;
    factoringActive: boolean;
    factoringAdvanceRate: number;
    factoringReserveRate: number;
    factoringAdvanceLagDays: number;
    typicalCustomerPayDays: number;
    collectionLagDays: number;
    chargebackTriggerType: string | null;
    chargebackTriggerDays: number | null;
    locActive: boolean;
  };
}

export default function CompanyFinancingPanel({ companyId, settings }: CompanyFinancingPanelProps) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/financing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      alert("Company financing profile saved.");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  const field = (key: keyof typeof form, label: string, type: "number" | "checkbox" = "number") => (
    <label style={{ fontSize: 13, display: "block", marginBottom: 10 }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      {type === "checkbox" ? (
        <input
          type="checkbox"
          checked={Boolean(form[key])}
          onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
          style={{ marginLeft: 8 }}
        />
      ) : (
        <input
          type="number"
          step={key.includes("Rate") ? 0.01 : 1}
          value={Number(form[key]) || 0}
          onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
          style={{
            display: "block",
            width: "100%",
            maxWidth: 200,
            marginTop: 4,
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid var(--border)",
          }}
        />
      )}
    </label>
  );

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
      <div style={{ fontWeight: 600 }}>Company profile — financing & runway</div>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "6px 0 12px" }}>
        Set at distributor onboarding. Factoring applies to all AR when active. Chargeback rules can be
        updated when factor contract is known.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {field("runwayWeeks", "Runway weeks (default 13)")}
        {field("protectedCashReserve", "Protected cash reserve ($)")}
        {field("factoringActive", "Factoring active (all AR)", "checkbox")}
        {field("factoringAdvanceRate", "Advance rate (e.g. 0.8)")}
        {field("factoringReserveRate", "Reserve rate (e.g. 0.2)")}
        {field("factoringAdvanceLagDays", "Advance lag (days)")}
        {field("typicalCustomerPayDays", "Customer pay days (reserve tail)")}
        {field("collectionLagDays", "Extra collection lag (non-factor)")}
        {field("locActive", "LOC available for inventory", "checkbox")}
        <label style={{ fontSize: 13 }}>
          <span style={{ color: "var(--muted)" }}>Chargeback trigger type</span>
          <select
            value={form.chargebackTriggerType ?? ""}
            onChange={(e) => setForm({ ...form, chargebackTriggerType: e.target.value || null })}
            style={{ display: "block", marginTop: 4, padding: 6, borderRadius: 6 }}
          >
            <option value="">Not configured</option>
            <option value="days_past_due">Days past due</option>
            <option value="days_from_invoice">Days from invoice</option>
          </select>
        </label>
        {field("chargebackTriggerDays", "Chargeback trigger days")}
      </div>
      <button
        type="button"
        disabled={loading}
        onClick={save}
        style={{
          marginTop: 8,
          background: "var(--accent)",
          color: "#04122a",
          border: "none",
          borderRadius: 8,
          padding: "8px 14px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {loading ? "Saving…" : "Save company profile"}
      </button>
    </section>
  );
}
