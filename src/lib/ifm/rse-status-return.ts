import { rseApiBase } from "@/lib/ifm/rse-import";

export type RseIfmStatus =
  | "Approved"
  | "Approved with Caution"
  | "Reduce"
  | "Split Purchase"
  | "Delay"
  | "Block / Do Not Fund"
  | "Escalate for Review";

export interface RseStatusReturnItem {
  preLineId: string;
  ifmStatus: RseIfmStatus;
  finalQty?: number;
  notes?: string;
}

export interface RseStatusReturnResult {
  updated: number;
  failed: number;
  total: number;
  errors?: Array<{ preLineId: string; error: string }>;
}

export function mapDecisionToRseStatus(input: {
  systemDecisionLabel: string;
  requestedAmount: number;
  approvedAmount: number;
  proposedQuantity: number | null;
  estimatedUnitCost: number | null;
}): { ifmStatus: RseIfmStatus; finalQty?: number } {
  const { systemDecisionLabel, requestedAmount, approvedAmount, proposedQuantity, estimatedUnitCost } =
    input;
  const partial =
    approvedAmount > 0 && requestedAmount > 0 && approvedAmount < requestedAmount - 0.01;

  let finalQty: number | undefined;
  if (partial && proposedQuantity != null && proposedQuantity > 0 && requestedAmount > 0) {
    finalQty = Math.max(1, Math.round(proposedQuantity * (approvedAmount / requestedAmount)));
  } else if (partial && estimatedUnitCost != null && estimatedUnitCost > 0) {
    finalQty = Math.max(1, Math.round(approvedAmount / estimatedUnitCost));
  }

  if (/Decline|Block/.test(systemDecisionLabel)) {
    return { ifmStatus: "Block / Do Not Fund" };
  }
  if (/Hold Until|Insufficient/.test(systemDecisionLabel)) {
    return { ifmStatus: "Escalate for Review" };
  }
  if (/Delay Purchase/.test(systemDecisionLabel)) {
    return { ifmStatus: "Delay" };
  }
  if (/Split Purchase/.test(systemDecisionLabel)) {
    return { ifmStatus: "Split Purchase", finalQty };
  }
  if (/Reduce Order/.test(systemDecisionLabel)) {
    return { ifmStatus: "Reduce", finalQty };
  }
  if (partial) {
    return {
      ifmStatus: /Approve with Caution|Partial|Split|Emergency|Take Partial/.test(systemDecisionLabel)
        ? "Approved with Caution"
        : "Approved",
      finalQty,
    };
  }
  if (/Take Partial/.test(systemDecisionLabel)) {
    return { ifmStatus: "Approved with Caution", finalQty };
  }
  if (/Approve with Caution|Emergency Review/.test(systemDecisionLabel)) {
    return { ifmStatus: "Approved with Caution" };
  }

  return { ifmStatus: "Approved" };
}

export function preLineIdFromCandidate(candidate: {
  sources: Array<{ sourceType: string; sourceReferenceId: string | null }>;
}): string | null {
  const source = candidate.sources.find(
    (s) => s.sourceType === "RSE Recommendation" && s.sourceReferenceId,
  );
  return source?.sourceReferenceId?.trim() ?? null;
}

export async function pushStatusReturnToRse(
  updates: RseStatusReturnItem[],
): Promise<RseStatusReturnResult> {
  if (updates.length === 0) {
    return { updated: 0, failed: 0, total: 0 };
  }

  let res: Response;
  try {
    res = await fetch(`${rseApiBase()}/api/ifm/status-return`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates, actor: "ifm-reviewer" }),
      cache: "no-store",
    });
  } catch {
    throw new Error(
      `Could not reach RSE at ${rseApiBase()}. Start RSE and try again — IFM approval was saved locally.`,
    );
  }

  const data = (await res.json()) as RseStatusReturnResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `RSE returned ${res.status}`);
  }
  return data;
}
