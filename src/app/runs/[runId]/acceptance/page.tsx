import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { usd } from "@/lib/format";

export const dynamic = "force-dynamic";

const SAMPLE_COMPANY = "Steve's Bowling Supply Company";

// Expected decision by candidate SKU (Document 7 §7 / Document 8 §6).
const EXPECTED_DECISION: Record<string, string[]> = {
  "KS-BALL-100": ["Approve"],
  "KS-CLEAN-210": ["Approve with Caution"],
  "KS-ACC-330": ["Approve with Caution"],
  "LM-PROMO": ["Take Partial Vendor Offer"],
  "KS-PIN-500": ["Owner Approval Required"],
  "KS-NOV-700": ["Decline Vendor Offer", "Hold Until More Data"],
  __DRAFT_PO__: ["Hold Until More Data", "Delay Purchase"],
};

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", borderBottom: "1px solid var(--border)" };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid var(--border)", fontSize: 13 };

function Badge({ pass }: { pass: boolean }) {
  return (
    <span style={{ background: pass ? "rgba(62,207,142,0.15)" : "rgba(255,107,107,0.15)", color: pass ? "var(--good)" : "var(--bad)", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>
      {pass ? "PASS" : "FAIL"}
    </span>
  );
}

export default async function AcceptancePage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = await prisma.ifmRun.findUnique({
    where: { id: runId },
    include: { company: true, fundingCalculation: true, purchaseDecisions: { include: { candidate: true } } },
  });
  if (!run) notFound();

  const isSample = run.company.companyName === SAMPLE_COMPANY;
  const fc = run.fundingCalculation;

  const fundingChecks = [
    { name: "Core available inventory funding", expected: 47000, actual: fc?.coreAvailableInventoryFunding },
    { name: "Supplemental funding capacity", expected: 141000, actual: fc?.supplementalFundingCapacity },
    { name: "Total potential inventory funding", expected: 188000, actual: fc?.totalPotentialInventoryFunding },
    { name: "Included AR inflows (100/60/20%)", expected: 167000, actual: fc?.confidentExpectedInflows },
    { name: "Required outflows", expected: 195000, actual: fc?.requiredOutflowsTotal },
    { name: "AP pressure", expected: 190000, actual: fc?.apPressureTotal },
    { name: "Committed open PO exposure", expected: 85000, actual: fc?.openPoExposureTotal },
  ];

  const decisionChecks = run.purchaseDecisions.map((dn) => {
    const key = dn.candidate.skuOrItemId ?? "__DRAFT_PO__";
    const options = EXPECTED_DECISION[key] ?? [];
    return {
      label: dn.candidate.skuOrItemId ?? dn.candidate.sourceOfRequest,
      vendor: dn.candidate.vendorName,
      expected: options.join(" / "),
      actual: dn.systemDecisionLabel,
      pass: options.length === 0 || options.includes(dn.systemDecisionLabel),
    };
  });

  const allFundingPass = isSample && fundingChecks.every((c) => Number(c.actual) === c.expected);
  const allDecisionPass = isSample && decisionChecks.every((c) => c.pass);

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "32px 24px 64px" }}>
      <Link href={`/runs/${run.id}`} style={{ fontSize: 13, color: "var(--muted)" }}>← Back to run</Link>
      <h1 style={{ fontSize: 24, margin: "8px 0 4px" }}>Acceptance — Document 7 / Document 8</h1>
      <p style={{ color: "var(--muted)", marginTop: 0, fontSize: 14 }}>
        {run.company.companyName} · {run.runName}
      </p>

      {!isSample && (
        <div style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: 20, color: "var(--muted)", marginTop: 12 }}>
          The Document 7 expected-results matrix applies to the Steve&apos;s Bowling Supply sample run.
          This run uses different data, so only its calculated figures are shown on the run page.
        </div>
      )}

      {isSample && (
        <>
          <section style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 16 }}>Funding calculations <Badge pass={allFundingPass} /></h2>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={th}>Check</th><th style={th}>Expected</th><th style={th}>Actual</th><th style={th}>Result</th></tr></thead>
              <tbody>
                {fundingChecks.map((c) => (
                  <tr key={c.name}>
                    <td style={td}>{c.name}</td>
                    <td style={td}>{usd(c.expected)}</td>
                    <td style={td}>{usd(Number(c.actual))}</td>
                    <td style={td}><Badge pass={Number(c.actual) === c.expected} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 16 }}>Decision outcomes <Badge pass={allDecisionPass} /></h2>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={th}>Candidate</th><th style={th}>Vendor</th><th style={th}>Expected</th><th style={th}>Actual</th><th style={th}>Result</th></tr></thead>
              <tbody>
                {decisionChecks.map((c, i) => (
                  <tr key={i}>
                    <td style={td}>{c.label}</td>
                    <td style={td}>{c.vendor}</td>
                    <td style={td}>{c.expected}</td>
                    <td style={td}>{c.actual}</td>
                    <td style={td}><Badge pass={c.pass} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
