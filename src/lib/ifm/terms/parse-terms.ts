export interface PaymentInstallment {
  dueDate: Date;
  amount: number;
  label: string;
}

export interface ParsedTerms {
  raw: string;
  scheduleType: "single" | "installments" | "unknown";
  installments: PaymentInstallment[];
  totalAmount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Parse common vendor terms text into dated payment installments. */
export function parseTermsToSchedule(
  termsText: string | null | undefined,
  totalAmount: number,
  anchorDate: Date,
): ParsedTerms {
  const raw = (termsText ?? "").trim();
  if (!raw || totalAmount <= 0) {
    return { raw, scheduleType: "unknown", installments: [], totalAmount };
  }

  const upper = raw.toUpperCase().replace(/\s+/g, " ");

  // 12 monthly equal payments
  const monthlyMatch = upper.match(/(\d+)\s*(?:MONTHLY|EQUAL\s*MONTHLY|MONTH)/);
  if (monthlyMatch) {
    const count = parseInt(monthlyMatch[1], 10);
    if (count > 0 && count <= 36) {
      const each = round2(totalAmount / count);
      const installments: PaymentInstallment[] = [];
      let allocated = 0;
      for (let i = 0; i < count; i++) {
        const amt = i === count - 1 ? round2(totalAmount - allocated) : each;
        allocated += amt;
        installments.push({
          dueDate: addDays(anchorDate, 30 * (i + 1)),
          amount: amt,
          label: `Month ${i + 1}/${count}`,
        });
      }
      return { raw, scheduleType: "installments", installments, totalAmount };
    }
  }

  // 30/60/90 style
  const slashMatch = upper.match(/(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/);
  if (slashMatch) {
    const days = [slashMatch[1], slashMatch[2], slashMatch[3]].map((d) => parseInt(d, 10));
    const each = round2(totalAmount / days.length);
    let allocated = 0;
    const installments = days.map((d, i) => {
      const amt = i === days.length - 1 ? round2(totalAmount - allocated) : each;
      allocated += amt;
      return {
        dueDate: addDays(anchorDate, d),
        amount: amt,
        label: `Day ${d}`,
      };
    });
    return { raw, scheduleType: "installments", installments, totalAmount };
  }

  // NET N
  const netMatch = upper.match(/NET\s*(\d+)/);
  if (netMatch) {
    const days = parseInt(netMatch[1], 10);
    return {
      raw,
      scheduleType: "single",
      installments: [
        { dueDate: addDays(anchorDate, days), amount: round2(totalAmount), label: `NET ${days}` },
      ],
      totalAmount,
    };
  }

  // COD / PREPAID
  if (/^(COD|C\.O\.D|PREPAID|PRE\s*PAID|DUE\s*ON\s*RECEIPT)/.test(upper)) {
    return {
      raw,
      scheduleType: "single",
      installments: [{ dueDate: anchorDate, amount: round2(totalAmount), label: "COD" }],
      totalAmount,
    };
  }

  return { raw, scheduleType: "unknown", installments: [], totalAmount };
}

export function installmentsInWeeks(
  installments: PaymentInstallment[],
  weekStarts: Date[],
  weekEnds: Date[],
): Map<number, number> {
  const byWeek = new Map<number, number>();
  for (const inst of installments) {
    const t = inst.dueDate.getTime();
    for (let w = 0; w < weekStarts.length; w++) {
      if (t >= weekStarts[w].getTime() && t <= weekEnds[w].getTime()) {
        byWeek.set(w, round2((byWeek.get(w) ?? 0) + inst.amount));
        break;
      }
      if (w === weekStarts.length - 1 && t > weekEnds[w].getTime()) {
        break;
      }
    }
  }
  return byWeek;
}

export function installmentsAfterHorizon(
  installments: PaymentInstallment[],
  horizonEnd: Date,
): { total: number; count: number } {
  let total = 0;
  let count = 0;
  for (const inst of installments) {
    if (inst.dueDate.getTime() > horizonEnd.getTime()) {
      total += inst.amount;
      count += 1;
    }
  }
  return { total: round2(total), count };
}
