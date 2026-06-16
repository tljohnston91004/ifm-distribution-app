"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const btn: React.CSSProperties = {
  background: "var(--accent)",
  color: "#04122a",
  border: "none",
  borderRadius: 8,
  padding: "9px 16px",
  fontWeight: 600,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  ...btn,
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--border)",
};

export function SeedButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <button
      style={{ ...btn, opacity: loading ? 0.6 : 1 }}
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const res = await fetch("/api/seed", { method: "POST" });
          const data = await res.json();
          if (data.runId) router.push(`/runs/${data.runId}`);
          else throw new Error(data.error ?? "Seed failed");
        } catch (e) {
          alert(e instanceof Error ? e.message : "Seed failed");
          setLoading(false);
        }
      }}
    >
      {loading ? "Loading sample…" : "Load sample run (Steve's Bowling Supply)"}
    </button>
  );
}

export function ImportRseButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <button
      style={{ ...btn, opacity: loading ? 0.6 : 1 }}
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const preview = await fetch(`/api/runs/${runId}/import-rse/preview`);
          const previewData = await preview.json();
          if (!preview.ok) throw new Error(previewData.error ?? "Could not reach RSE");

          const msg = [
            `Import ${previewData.lineCount} purchase line(s) from RSE?`,
            `Total: $${Number(previewData.totalDollars).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            "",
            "This replaces any prior RSE Recommendation candidates on this IFM run.",
          ].join("\n");

          if (!window.confirm(msg)) {
            setLoading(false);
            return;
          }

          const res = await fetch(`/api/runs/${runId}/import-rse`, { method: "POST" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Import failed");

          alert(
            `Imported ${data.imported} line(s) from RSE (${data.vendorCount} vendors, $${Number(data.totalDollars).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total).\n\nNext: add cash data if needed, then click Recalculate.`,
          );
          router.refresh();
        } catch (e) {
          alert(e instanceof Error ? e.message : "Import failed");
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? "Importing…" : "Import from RSE"}
    </button>
  );
}

export function CalculateButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <button
      style={{ ...btnGhost, opacity: loading ? 0.6 : 1 }}
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const res = await fetch(`/api/runs/${runId}/calculate`, { method: "POST" });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          router.refresh();
        } catch (e) {
          alert(e instanceof Error ? e.message : "Calculation failed");
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? "Recalculating…" : "Recalculate"}
    </button>
  );
}
