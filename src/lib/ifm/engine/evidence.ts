import type { CandidateInput } from "../types";

export type RsePriority = "high" | "medium" | "caution" | "low" | "review";

const has = (value: string | null | undefined, ...needles: string[]) => {
  const v = (value ?? "").toLowerCase();
  return needles.some((n) => v.includes(n));
};

// Evidence hierarchy — Document 4 §8. Returns a rank 1 (strongest) … 10 (unsupported).
export function evidenceRank(candidate: CandidateInput): number {
  const source = candidate.sourceOfRequest;
  const reason = candidate.needReason;
  const strongest = candidate.evidence.reduce<string>((acc, e) => {
    const order = ["strong", "moderate", "weak", "unsupported"];
    return order.indexOf(e.evidenceStrength) < order.indexOf(acc || "unsupported")
      ? e.evidenceStrength
      : acc;
  }, "");
  const rse = candidate.rseClassification;
  const strongDemand = candidate.demandSupportLevel === "strong";

  // 1 — Confirmed customer order / backorder.
  if (has(source, "backorder") || has(reason, "backorder") || has(reason, "customer order")) {
    return 1;
  }
  // 2 — RSE-supported fast-moving replenishment.
  if (rse === "fast" && has(reason, "replenish")) return 2;
  // 3 — RSE-supported below-Min with strong demand.
  if (candidate.belowMin && strongDemand) return 3;
  // 4 — Reorder report supported by Min/Max and recent demand.
  if (has(source, "reorder") && (strongDemand || candidate.demandSupportLevel === "moderate")) {
    return 4;
  }
  // 5 — Buyer request with documented demand / customer need.
  if (has(source, "buyer") && strongest && strongest !== "unsupported" && strongest !== "weak") {
    return 5;
  }
  // 6 — Vendor offer supported by strong demand and sell-through.
  if ((has(source, "vendor") || has(source, "offer") || has(reason, "promo")) && strongDemand) {
    return 6;
  }
  // 7 — Strategic item exception with documented reason (needs approval).
  if (has(reason, "strategic")) return 7;
  // 8 — Vendor offer based mostly on discount / terms / vendor pressure.
  if (has(source, "vendor") || has(source, "offer") || has(reason, "promo")) return 8;
  // 9 — Manual request with limited support.
  if (has(source, "manual") || strongest === "weak") return 9;
  // 10 — Unsupported request.
  if (!strongest || strongest === "unsupported") return 10;

  return 6; // default: moderate support
}

// RSE classification funding priority — Document 4 §9.
export function rsePriority(candidate: CandidateInput): RsePriority {
  switch (candidate.rseClassification) {
    case "fast":
      return "high";
    case "moderate":
      return "medium";
    case "seasonal":
      return "caution";
    case "slow":
    case "overstock":
      return "low";
    case "none":
    default:
      return "review";
  }
}
