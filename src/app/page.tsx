import Link from "next/link";
import { prisma } from "@/lib/db";
import { SeedButton } from "@/components/RunActions";
import { usd, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const runs = await prisma.ifmRun.findMany({
    orderBy: { createdAt: "desc" },
    include: { company: true, fundingCalculation: true, _count: { select: { purchaseCandidates: true } } },
  });

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 24px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <p style={{ color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, fontSize: 12, margin: 0 }}>
            Distribution · V1.5
          </p>
          <h1 style={{ fontSize: 30, margin: "6px 0" }}>Inventory Funding Manager</h1>
          <p style={{ color: "var(--muted)", maxWidth: 620, margin: 0 }}>
            Decide how much inventory can be responsibly funded now, and which purchase candidates
            to fund, reduce, delay, split, hold, or decline.
          </p>
        </div>
        <Link
          href="/runs/new"
          style={{ background: "var(--accent)", color: "#04122a", borderRadius: 8, padding: "9px 16px", fontWeight: 600, whiteSpace: "nowrap" }}
        >
          + New IFM Run
        </Link>
      </header>

      <section style={{ marginTop: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 18 }}>Runs</h2>
          <SeedButton />
        </div>

        {runs.length === 0 ? (
          <div
            style={{
              marginTop: 12,
              border: "1px dashed var(--border)",
              borderRadius: 12,
              padding: 32,
              textAlign: "center",
              color: "var(--muted)",
            }}
          >
            No runs yet. Load the Steve&apos;s Bowling Supply sample to see a fully calculated run,
            or create a new IFM run.
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {runs.map((run) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 1fr 0.9fr 0.9fr",
                  gap: 12,
                  alignItems: "center",
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "14px 18px",
                  color: "var(--text)",
                }}
              >
                <div>
                  <strong>{run.runName}</strong>
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>{run.company.companyName}</div>
                </div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>
                  {shortDate(run.fundingWindowStart)} → {shortDate(run.fundingWindowEnd)}
                </div>
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: "var(--muted)" }}>Total potential</span>
                  <div>{usd(run.fundingCalculation?.totalPotentialInventoryFunding)}</div>
                </div>
                <div style={{ fontSize: 13, textAlign: "right" }}>
                  <span
                    style={{
                      background: "var(--panel-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 999,
                      padding: "3px 10px",
                      fontSize: 12,
                      color: "var(--muted)",
                    }}
                  >
                    {run.runStatus}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
