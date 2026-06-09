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
