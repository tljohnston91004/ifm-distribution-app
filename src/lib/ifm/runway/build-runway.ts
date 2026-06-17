import { parseTermsToSchedule, installmentsAfterHorizon } from "@/lib/ifm/terms/parse-terms";
import { estimateCashBackDays, parseSellThroughDaysJson, sellThroughDaysForClass } from "./sell-through";

const DAY_MS = 24 * 60 * 60 * 1000;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export interface RunwayCandidateInput {
  id: string;
  vendorName: string;
  skuOrItemId: string | null;
  estimatedTotalCost: number;
  orderTerms: string | null;
  termsStatus: string;
  approvedClass: string | null;
  expectedPurchaseDate: Date | null;
}

export interface RunwayBuildInput {
  reviewDate: Date;
  runwayWeeks: number;
  startingCash: number;
  protectedReserve: number;
  apOutflowsByWeek?: Map<number, number>;
  otherOutflowsByWeek?: Map<number, number>;
  arInflowsByWeek?: Map<number, number>;
  candidates: RunwayCandidateInput[];
  sellThroughDaysJson: string | null;
  factoringActive: boolean;
  factoringAdvanceRate: number;
  factoringReserveRate: number;
  factoringAdvanceLagDays: number;
  typicalCustomerPayDays: number;
  collectionLagDays: number;
}

export interface RunwayWeek {
  weekIndex: number;
  weekStart: string;
  weekEnd: string;
  openingBalance: number;
  inflows: number;
  outflows: number;
  closingBalance: number;
  events: string[];
}

export interface TailCommitment {
  candidateId: string;
  vendorName: string;
  sku: string | null;
  remainingAmount: number;
  installmentCount: number;
  terms: string;
}

export interface RunwayResult {
  weeks: RunwayWeek[];
  minCashBalance: number;
  minCashWeekIndex: number;
  belowReserveFlag: boolean;
  tailCommitments: TailCommitment[];
}

export function buildCashRunway(input: RunwayBuildInput): RunwayResult {
  const weekStarts: Date[] = [];
  const weekEnds: Date[] = [];
  const base = startOfWeek(input.reviewDate);

  for (let w = 0; w < input.runwayWeeks; w++) {
    const ws = new Date(base.getTime() + w * 7 * DAY_MS);
    const we = new Date(ws.getTime() + 6 * DAY_MS);
    weekStarts.push(ws);
    weekEnds.push(we);
  }

  const horizonEnd = weekEnds[weekEnds.length - 1];
  const sellTable = parseSellThroughDaysJson(input.sellThroughDaysJson);

  const outflowsByWeek = new Map<number, number>();
  const inflowsByWeek = new Map<number, number>();
  const eventsByWeek = new Map<number, string[]>();
  const tailCommitments: TailCommitment[] = [];

  const addEvent = (w: number, msg: string) => {
    const list = eventsByWeek.get(w) ?? [];
    list.push(msg);
    eventsByWeek.set(w, list);
  };

  for (let w = 0; w < input.runwayWeeks; w++) {
    const ap = input.apOutflowsByWeek?.get(w) ?? 0;
    const other = input.otherOutflowsByWeek?.get(w) ?? 0;
    const ar = input.arInflowsByWeek?.get(w) ?? 0;
    if (ap > 0) {
      outflowsByWeek.set(w, round2((outflowsByWeek.get(w) ?? 0) + ap));
      addEvent(w, `AP/outflows $${ap.toLocaleString()}`);
    }
    if (other > 0) {
      outflowsByWeek.set(w, round2((outflowsByWeek.get(w) ?? 0) + other));
      addEvent(w, `Required outflows $${other.toLocaleString()}`);
    }
    if (ar > 0) {
      inflowsByWeek.set(w, round2((inflowsByWeek.get(w) ?? 0) + ar));
      addEvent(w, `AR inflows $${ar.toLocaleString()}`);
    }
  }

  for (const c of input.candidates) {
    if (c.termsStatus === "pending" || !c.orderTerms) continue;
    const anchor = c.expectedPurchaseDate ?? input.reviewDate;
    const parsed = parseTermsToSchedule(c.orderTerms, c.estimatedTotalCost, anchor);

    for (const inst of parsed.installments) {
      const t = inst.dueDate.getTime();
      for (let w = 0; w < input.runwayWeeks; w++) {
        if (t >= weekStarts[w].getTime() && t <= weekEnds[w].getTime()) {
          outflowsByWeek.set(w, round2((outflowsByWeek.get(w) ?? 0) + inst.amount));
          addEvent(w, `PO ${c.vendorName} ${inst.label} −$${inst.amount.toLocaleString()}`);
          break;
        }
      }
    }

    const tail = installmentsAfterHorizon(parsed.installments, horizonEnd);
    if (tail.total > 0) {
      tailCommitments.push({
        candidateId: c.id,
        vendorName: c.vendorName,
        sku: c.skuOrItemId,
        remainingAmount: tail.total,
        installmentCount: tail.count,
        terms: parsed.raw,
      });
    }

    const sellDays = sellThroughDaysForClass(c.approvedClass, sellTable);
    const cashBackDays = estimateCashBackDays({
      sellThroughDays: sellDays,
      collectionLagDays: input.collectionLagDays,
      factoringActive: input.factoringActive,
      advanceRate: input.factoringAdvanceRate,
      reserveRate: input.factoringReserveRate,
      advanceLagDays: input.factoringAdvanceLagDays,
      typicalCustomerPayDays: input.typicalCustomerPayDays,
      weightedCashBackDays: 0,
    });

    const cashInDate = new Date(anchor.getTime() + cashBackDays * DAY_MS);
    const estimatedInflow = round2(
      c.estimatedTotalCost * (input.factoringActive ? input.factoringAdvanceRate : 1) * 0.85,
    );
    for (let w = 0; w < input.runwayWeeks; w++) {
      if (cashInDate.getTime() >= weekStarts[w].getTime() && cashInDate.getTime() <= weekEnds[w].getTime()) {
        inflowsByWeek.set(w, round2((inflowsByWeek.get(w) ?? 0) + estimatedInflow));
        addEvent(w, `Est. cash-back ${c.skuOrItemId ?? c.vendorName} +$${estimatedInflow.toLocaleString()}`);
        break;
      }
    }
  }

  const weeks: RunwayWeek[] = [];
  let balance = input.startingCash;
  let minCash = balance;
  let minWeek = 0;

  for (let w = 0; w < input.runwayWeeks; w++) {
    const opening = balance;
    const inf = inflowsByWeek.get(w) ?? 0;
    const out = outflowsByWeek.get(w) ?? 0;
    balance = round2(opening + inf - out);
    if (balance < minCash) {
      minCash = balance;
      minWeek = w;
    }
    weeks.push({
      weekIndex: w + 1,
      weekStart: weekStarts[w].toISOString().slice(0, 10),
      weekEnd: weekEnds[w].toISOString().slice(0, 10),
      openingBalance: opening,
      inflows: inf,
      outflows: out,
      closingBalance: balance,
      events: eventsByWeek.get(w) ?? [],
    });
  }

  return {
    weeks,
    minCashBalance: minCash,
    minCashWeekIndex: minWeek + 1,
    belowReserveFlag: minCash < input.protectedReserve,
    tailCommitments,
  };
}
