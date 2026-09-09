import type { ParsedUploadRow, ParseUploadResult } from "./parse";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ProfitLossParseOptions {
  reviewDate: Date;
  runwayWeeks?: number;
}

function rowLabel(row: string[]): string {
  return String(row[0] ?? "").trim();
}

function parseAmountCell(raw: string): number {
  const cleaned = String(raw ?? "")
    .replace(/[$,]/g, "")
    .replace(/^\((.+)\)$/, "-$1")
    .trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

function rowTotal(row: string[]): number {
  // QB standard reports put the primary amount in column B (index 1).
  if (row.length > 1) {
    const primary = parseAmountCell(String(row[1] ?? ""));
    if (primary !== 0 || String(row[1] ?? "").trim() === "0") return primary;
  }
  for (let i = row.length - 1; i >= 1; i--) {
    const n = parseAmountCell(String(row[i] ?? ""));
    if (n !== 0 || String(row[i] ?? "").trim() === "0") return n;
  }
  return 0;
}

function isQuickBooksProfitLoss(matrix: string[][]): boolean {
  const text = matrix
    .slice(0, 6)
    .flat()
    .join(" ")
    .toLowerCase();
  return text.includes("profit and loss") || text.includes("profit & loss");
}

function parsePeriod(matrix: string[][]): { start: Date; end: Date; label: string } {
  for (let i = 0; i < Math.min(6, matrix.length); i++) {
    for (const cell of matrix[i]) {
      const t = String(cell).trim();
      if (!t || /profit and loss/i.test(t) || /profit & loss/i.test(t)) continue;

      const shortRange = t.match(/^([A-Za-z]+)\s+(\d{1,2})\s*-\s*(\d{1,2}),\s*(\d{4})$/);
      if (shortRange) {
        const [, month, day1, day2, year] = shortRange;
        const start = new Date(`${month} ${day1}, ${year}`);
        const end = new Date(`${month} ${day2}, ${year}`);
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
          return { start, end, label: t };
        }
      }

      const range = t.match(/^(.+?)-(.+),\s*(\d{4})$/);
      if (range) {
        const start = new Date(`${range[1].trim()}, ${range[3]}`);
        const end = new Date(`${range[2].trim()}, ${range[3]}`);
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
          return { start, end, label: t };
        }
      }

      const through = t.match(/^(.+?)\s+through\s+(.+)$/i);
      if (through) {
        const start = new Date(through[1].trim());
        const end = new Date(through[2].trim());
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
          return { start, end, label: t };
        }
      }
    }
  }
  throw new Error("QuickBooks Profit and Loss detected but report period was not found.");
}

function periodWeeks(start: Date, end: Date): number {
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
  return Math.max(1, days / 7);
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function collectTotalForParents(matrix: string[][]): Set<string> {
  const parents = new Set<string>();
  for (const row of matrix) {
    const label = rowLabel(row);
    const m = label.match(/^Total for (.+)$/i);
    if (m) parents.add(m[1].trim().toLowerCase());
  }
  return parents;
}

function mapOutflowType(label: string): string {
  const l = label.toLowerCase();
  if (/payroll|wage|salary|compensation/.test(l)) return "payroll";
  if (/tax|sales tax|payroll tax/.test(l)) return "taxes";
  if (/rent|lease/.test(l)) return "rent";
  if (/debt|loan|interest/.test(l)) return "debt";
  if (/insurance/.test(l)) return "other";
  return "other";
}

function isAggregateTotal(label: string): boolean {
  return /^total for (income|expenses|cost of goods sold|gross profit|net operating income|net other income|net income|other expenses)/i.test(
    label,
  );
}

function isIncludedExpenseLine(label: string, amount: number, parents: Set<string>): boolean {
  if (!label || amount === 0) return false;
  if (/^(income|expenses|cost of goods sold|gross profit|net operating income|net income|other expenses|utilities|job materials|job expenses|labor)$/i.test(label)) {
    return false;
  }
  if (isAggregateTotal(label)) return false;
  if (/^total for /i.test(label)) return true;
  return !parents.has(label.toLowerCase());
}

function findSectionBounds(matrix: string[][]): { expensesStart: number; otherExpensesStart: number | null; end: number } {
  let expensesStart = -1;
  let otherExpensesStart: number | null = null;
  let end = matrix.length;

  for (let i = 0; i < matrix.length; i++) {
    const label = rowLabel(matrix[i]);
    if (label === "Expenses" && expensesStart < 0) expensesStart = i;
    if (label === "Other Expenses") otherExpensesStart = i;
    if (label === "Net Income" || label === "Net Operating Income") {
      end = i;
      break;
    }
  }

  if (expensesStart < 0) {
    throw new Error("QuickBooks Profit and Loss detected but Expenses section was not found.");
  }

  return { expensesStart, otherExpensesStart, end };
}

export function tryParseQuickBooksProfitLoss(
  matrix: string[][],
  options: ProfitLossParseOptions,
): ParseUploadResult | null {
  if (!isQuickBooksProfitLoss(matrix)) return null;

  const period = parsePeriod(matrix);
  const weeksInPeriod = periodWeeks(period.start, period.end);
  const runwayWeeks = options.runwayWeeks ?? 13;
  const parents = collectTotalForParents(matrix);
  const { expensesStart, otherExpensesStart, end } = findSectionBounds(matrix);

  const expenseLines: { label: string; ytdTotal: number; outflowType: string }[] = [];

  for (let i = expensesStart + 1; i < end; i++) {
    const row = matrix[i];
    const label = rowLabel(row);
    const amount = rowTotal(row);

    const inOther = otherExpensesStart !== null && i >= otherExpensesStart;
    const inMainExpenses = i < (otherExpensesStart ?? end);

    if (!inMainExpenses && !inOther) continue;
    if (!isIncludedExpenseLine(label, amount, parents)) continue;

    expenseLines.push({
      label: label.replace(/^Total for /i, ""),
      ytdTotal: amount,
      outflowType: mapOutflowType(label),
    });
  }

  if (expenseLines.length === 0) {
    throw new Error("QuickBooks Profit and Loss detected but no expense lines with amounts were found.");
  }

  const weekStarts: Date[] = [];
  const base = startOfWeek(options.reviewDate);
  for (let w = 0; w < runwayWeeks; w++) {
    weekStarts.push(new Date(base.getTime() + w * 7 * DAY_MS));
  }

  const rows: ParsedUploadRow[] = [];
  let rowNumber = 1;

  for (const line of expenseLines) {
    const weeklyAmount = Math.round((line.ytdTotal / weeksInPeriod) * 100) / 100;
    if (weeklyAmount <= 0) continue;

    for (let w = 0; w < runwayWeeks; w++) {
      rows.push({
        rowNumber: rowNumber++,
        values: {
          outflow_type: line.outflowType,
          vendor_or_payee: `P&L forecast: ${line.label} (wk ${w + 1}/${runwayWeeks})`,
          amount: String(weeklyAmount),
          due_date: isoDate(weekStarts[w]),
          required_status: "flexible",
          can_delay: "true",
          payment_priority: "normal",
          data_confidence: "Medium Confidence",
        },
      });
    }
  }

  const ytdExpenseTotal = expenseLines.reduce((s, l) => s + l.ytdTotal, 0);
  const weeklyTotal = Math.round((ytdExpenseTotal / weeksInPeriod) * 100) / 100;
  const forecastTotal = Math.round(weeklyTotal * runwayWeeks * 100) / 100;

  const warnings = [
    `Parsed as QuickBooks Profit and Loss (${period.label}). Historical YTD expenses projected forward.`,
    `YTD period ≈ ${weeksInPeriod.toFixed(1)} weeks; ${expenseLines.length} expense line(s); ~$${weeklyTotal.toLocaleString("en-US")}/week → $${forecastTotal.toLocaleString("en-US")} over ${runwayWeeks} weeks.`,
    "P&L forecast is a run-rate estimate (flexible), not confirmed payment dates. Use payroll/tax schedules where available.",
    "COGS and revenue are excluded. Vendor bills stay in AP Aging.",
  ];

  return {
    rows,
    mappedHeaders: {
      outflow_type: "(from account name)",
      vendor_or_payee: "(P&L line label)",
      amount: "(YTD ÷ period weeks)",
      due_date: `(review date + ${runwayWeeks} weekly buckets)`,
    },
    warnings,
  };
}

/** @internal test helper */
export function detectProfitLoss(matrix: string[][]): boolean {
  return isQuickBooksProfitLoss(matrix);
}
