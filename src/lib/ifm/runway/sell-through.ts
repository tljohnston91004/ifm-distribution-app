const DEFAULT_DAYS: Record<string, number> = {
  A: 35,
  B: 50,
  C: 75,
  D: 120,
  E: 180,
  F: 240,
};

export function parseSellThroughDaysJson(json: string | null | undefined): Record<string, number> {
  if (!json) return { ...DEFAULT_DAYS };
  try {
    const parsed = JSON.parse(json) as Record<string, number>;
    return { ...DEFAULT_DAYS, ...parsed };
  } catch {
    return { ...DEFAULT_DAYS };
  }
}

/** Map Keystroke/RSE class letter (A–F) to sell-through days. */
export function sellThroughDaysForClass(
  approvedClass: string | null | undefined,
  table: Record<string, number>,
): number {
  const key = (approvedClass ?? "").trim().toUpperCase().charAt(0);
  if (key && table[key] != null) return table[key];
  if (/fast/i.test(approvedClass ?? "")) return table.A ?? 35;
  if (/slow|overstock/i.test(approvedClass ?? "")) return table.E ?? 180;
  if (/moderate/i.test(approvedClass ?? "")) return table.C ?? 75;
  return table.C ?? 75;
}

export interface CashBackEstimate {
  sellThroughDays: number;
  collectionLagDays: number;
  factoringActive: boolean;
  advanceRate: number;
  reserveRate: number;
  advanceLagDays: number;
  typicalCustomerPayDays: number;
  /** Weighted days until cash is back from this sale. */
  weightedCashBackDays: number;
}

export function estimateCashBackDays(input: CashBackEstimate): number {
  const sell = input.sellThroughDays + input.collectionLagDays;
  if (!input.factoringActive) return sell;
  const advancePart =
    input.advanceRate * (input.sellThroughDays + input.advanceLagDays);
  const reservePart =
    input.reserveRate * (input.sellThroughDays + input.typicalCustomerPayDays);
  return Math.round(advancePart + reservePart);
}
