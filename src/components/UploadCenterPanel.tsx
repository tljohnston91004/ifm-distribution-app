"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  UPLOAD_DOMAINS,
  type UploadDomainConfig,
} from "@/lib/ifm/upload/domains";
import { filenameDomainMismatchMessage } from "@/lib/ifm/upload/filename-hints";
import type { ConfirmedNoneFlags } from "@/lib/ifm/upload/import";
import { errorMessage, readJsonResponse } from "@/lib/api-response";

interface UploadCounts {
  cash_positions: number;
  required_outflows: number;
  ap_items: number;
  ar_items: number;
  open_purchase_orders: number;
  inventory_snapshots: number;
  reorder_sources: number;
  vendor_terms: number;
  purchase_candidates: number;
}

interface UploadCenterPanelProps {
  runId: string;
  reviewDate: string;
  reviewCadence: string;
  counts: UploadCounts;
  confirmedNone: ConfirmedNoneFlags;
}

const SOURCE_PRESETS = [
  { label: "QuickBooks", type: "accounting" },
  { label: "Keystroke", type: "POS" },
  { label: "Bank portal", type: "bank" },
  { label: "Excel / spreadsheet", type: "spreadsheet" },
  { label: "Other", type: "other" },
] as const;

function DomainCard({
  runId,
  domain,
  count,
  confirmedNone,
  sourceSystemName,
  sourceSystemType,
}: {
  runId: string;
  domain: UploadDomainConfig;
  count: number;
  confirmedNone: ConfirmedNoneFlags;
  sourceSystemName: string;
  sourceSystemType: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState<boolean | null>(null);
  const [addToExisting, setAddToExisting] = useState(
    domain.allowMultiUpload === true && count > 0,
  );

  const noneConfirmed = domain.confirmNoneKey ? confirmedNone[domain.confirmNoneKey] === true : false;
  const hasData = count > 0;
  const status = hasData ? "loaded" : noneConfirmed ? "confirmed_none" : "missing";

  async function upload() {
    if (!file) {
      setStatusOk(false);
      setStatusMsg("Choose a .csv, .xlsx, or .xls file first.");
      return;
    }
    const mismatch = filenameDomainMismatchMessage(file.name, domain.id);
    if (mismatch) {
      setStatusOk(false);
      setStatusMsg(mismatch);
      return;
    }
    setLoading(true);
    setStatusMsg(null);
    setStatusOk(null);
    try {
      const form = new FormData();
      form.append("domain", domain.id);
      form.append("file", file);
      form.append("sourceSystemName", sourceSystemName);
      form.append("sourceSystemType", sourceSystemType);
      const replace = domain.allowMultiUpload ? !addToExisting : true;
      form.append("replaceExisting", replace ? "true" : "false");

      const res = await fetch(`/api/runs/${runId}/upload`, { method: "POST", body: form });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(errorMessage(data, "Upload failed"));

      const summary = [
        data.message,
        ...(Array.isArray(data.warnings) ? data.warnings : []),
      ]
        .filter(Boolean)
        .join(" · ");
      setStatusOk(true);
      setStatusMsg(summary);
      setFile(null);
      if (domain.allowMultiUpload) setAddToExisting(true);
      router.refresh();
    } catch (e) {
      setStatusOk(false);
      setStatusMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function clearAll() {
    if (!window.confirm(`Clear all ${count} row(s) from ${domain.label} on this run?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}/upload/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.id }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(errorMessage(data, "Clear failed"));
      setAddToExisting(false);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setLoading(false);
    }
  }

  async function markNone(confirmed: boolean) {
    if (!domain.confirmNoneKey) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}/upload/confirm-none`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.id, confirmed }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(errorMessage(data, "Update failed"));
      router.refresh();
    } catch (e) {
      setStatusOk(false);
      setStatusMsg(e instanceof Error ? e.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  const statusColor =
    status === "loaded" ? "var(--good)" : status === "confirmed_none" ? "var(--muted)" : "var(--warn)";

  return (
    <div
      style={{
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "12px 14px",
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{domain.label}</div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{domain.description}</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: statusColor, whiteSpace: "nowrap" }}>
          {hasData ? `${count} row(s)` : noneConfirmed ? "None confirmed" : "Not loaded"}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <a
          href={`/api/runs/${runId}/upload/template?domain=${domain.id}`}
          style={{
            fontSize: 12,
            color: "var(--accent)",
            textDecoration: "none",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 8px",
          }}
        >
          ↓ Template
        </a>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={loading}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ fontSize: 12, maxWidth: 220 }}
        />
        <button
          type="button"
          disabled={loading || !file}
          onClick={upload}
          style={{
            background: "var(--accent)",
            color: "#04122a",
            border: "none",
            borderRadius: 6,
            padding: "6px 10px",
            fontWeight: 600,
            fontSize: 12,
            cursor: loading ? "wait" : "pointer",
            opacity: loading || !file ? 0.6 : 1,
          }}
        >
          {loading
            ? "Uploading…"
            : domain.allowMultiUpload && addToExisting
            ? "Add file"
            : "Upload"}
        </button>
        {domain.allowMultiUpload && (
          <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={addToExisting}
              disabled={loading}
              onChange={(e) => setAddToExisting(e.target.checked)}
            />
            Add to existing rows
          </label>
        )}
        {domain.allowMultiUpload && hasData && (
          <button
            type="button"
            disabled={loading}
            onClick={clearAll}
            style={{
              background: "transparent",
              color: "var(--warn)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 12,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            Clear all
          </button>
        )}
        {domain.confirmNoneKey && (
          <button
            type="button"
            disabled={loading}
            onClick={() => markNone(!noneConfirmed)}
            style={{
              background: "transparent",
              color: "var(--muted)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 12,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {noneConfirmed ? "Undo none" : "Mark none exist"}
          </button>
        )}
      </div>
      {statusMsg && (
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.45,
            color: statusOk ? "var(--good)" : "var(--bad)",
            background: statusOk ? "rgba(46, 160, 67, 0.08)" : "rgba(248, 81, 73, 0.08)",
            border: `1px solid ${statusOk ? "var(--good)" : "var(--bad)"}`,
            borderRadius: 6,
            padding: "8px 10px",
          }}
        >
          {statusMsg}
        </div>
      )}
    </div>
  );
}

function SectionBlock({
  title,
  subtitle,
  domains,
  runId,
  counts,
  confirmedNone,
  sourceSystemName,
  sourceSystemType,
}: {
  title: string;
  subtitle: string;
  domains: UploadDomainConfig[];
  runId: string;
  counts: UploadCounts;
  confirmedNone: ConfirmedNoneFlags;
  sourceSystemName: string;
  sourceSystemType: string;
}) {
  return (
    <div>
      <h3 style={{ fontSize: 16, margin: "0 0 4px" }}>{title}</h3>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 12px" }}>{subtitle}</p>
      <div style={{ display: "grid", gap: 10 }}>
        {domains.map((domain) => (
          <DomainCard
            key={domain.id}
            runId={runId}
            domain={domain}
            count={counts[domain.id as keyof UploadCounts] ?? 0}
            confirmedNone={confirmedNone}
            sourceSystemName={sourceSystemName}
            sourceSystemType={sourceSystemType}
          />
        ))}
      </div>
    </div>
  );
}

export default function UploadCenterPanel({
  runId,
  reviewDate,
  reviewCadence,
  counts,
  confirmedNone,
}: UploadCenterPanelProps) {
  const [sourcePreset, setSourcePreset] = useState(0);
  const preset = SOURCE_PRESETS[sourcePreset];

  const financialDomains = useMemo(
    () => UPLOAD_DOMAINS.filter((d) => d.section === "financial"),
    [],
  );
  const posDomains = useMemo(() => UPLOAD_DOMAINS.filter((d) => d.section === "pos"), []);

  const financialLoaded = financialDomains.filter((d) => (counts[d.id as keyof UploadCounts] ?? 0) > 0).length;
  const cashReady = counts.cash_positions > 0 || confirmedNone.cash === true;

  return (
    <section
      style={{
        marginTop: 16,
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Data Upload Center</div>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "6px 0 0", maxWidth: 720 }}>
            Upload financial and POS data that does not come from RSE. Use CSV or Excel (.xlsx).
            <strong> QuickBooks Balance Sheet, A/P Aging, A/R Aging, and Profit &amp; Loss</strong> (.xlsx)
            upload directly — Syd&apos;s QB-style exports supported. Keystroke bucket <strong>AR.xls</strong> also
            accepted for AR. No cleanup needed.
            Financial data should be refreshed weekly (typically Monday) with the same review date.
            When <strong>DPOS-Distribution</strong> is active, IFM will pull this data automatically.
          </p>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "right" }}>
          <div>Review date: <strong style={{ color: "var(--text)" }}>{reviewDate}</strong></div>
          <div>Cadence: <strong style={{ color: "var(--text)" }}>{reviewCadence}</strong></div>
          <div style={{ marginTop: 4 }}>
            Financial: {financialLoaded}/{financialDomains.length} loaded
            {!cashReady && <span style={{ color: "var(--warn)" }}> · cash required</span>}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: "12px 14px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--panel-2)",
          fontSize: 12,
          lineHeight: 1.55,
        }}
      >
        <strong style={{ color: "var(--text)" }}>Syd&apos;s weekly files — one card each:</strong>
        <ol style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--muted)" }}>
          <li>
            <strong style={{ color: "var(--text)" }}>Cash position</strong> →{" "}
            <code>Syds_Sewing_Supply_QB_Balance_Sheet_May_2026.xlsx</code>
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>AP / bills due</strong> →{" "}
            <code>Syds_Sewing_Supply_QB_AP_Detail_May_2026.xlsx</code>
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>AR / expected collections</strong> →{" "}
            <code>AR.xls</code> (Keystroke)
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Required outflows</strong> →{" "}
            <code>Syds_Sewing_Supply_QB_Profit_and_Loss_May_2026.xlsx</code>
          </li>
        </ol>
        <div style={{ marginTop: 8, color: "var(--warn)" }}>
          Do not upload every QuickBooks file on the Cash card — each report has its own card below.
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          fontSize: 13,
        }}
      >
        <label style={{ color: "var(--muted)" }}>
          Default source for this upload batch:{" "}
          <select
            value={sourcePreset}
            onChange={(e) => setSourcePreset(Number(e.target.value))}
            style={{
              marginLeft: 6,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          >
            {SOURCE_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginTop: 18, display: "grid", gap: 22 }}>
        <SectionBlock
          title="Weekly financial snapshot"
          subtitle="Upload every Monday (or your review date): cash, AP, AR, and open PO exposure replace prior rows. Required outflows supports multiple files (payroll + tax + debt) when Add to existing is checked."
          domains={financialDomains}
          runId={runId}
          counts={counts}
          confirmedNone={confirmedNone}
          sourceSystemName={preset.label}
          sourceSystemType={preset.type}
        />
        <SectionBlock
          title="POS / ERP data (per funding run)"
          subtitle="Upload when running replenishment if not already loaded through RSE: inventory position, Keystroke reorder report, and vendor terms master."
          domains={posDomains}
          runId={runId}
          counts={counts}
          confirmedNone={confirmedNone}
          sourceSystemName={preset.label === "Keystroke" ? "Keystroke" : preset.label}
          sourceSystemType="POS"
        />
      </div>

      <div
        style={{
          marginTop: 16,
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px dashed var(--border)",
          fontSize: 12,
          color: "var(--muted)",
        }}
      >
        <strong style={{ color: "var(--text)" }}>Weekly workflow:</strong> create this week&apos;s run →
        upload financial files → <em>Import from RSE</em> for purchase lines → <em>Recalculate</em> for
        funding and 13-week runway. Purchase candidates: {counts.purchase_candidates} loaded from RSE.
      </div>
    </section>
  );
}
