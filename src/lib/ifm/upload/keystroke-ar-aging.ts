import type { ParsedUploadRow, ParseUploadResult } from "./parse";
import { normalizeHeader } from "./quickbooks-aging";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface KeystrokeArParseOptions {
  reviewDate?: Date;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(base: Date, days: number): string {
  return isoDate(new Date(base.getTime() + days * DAY_MS));
}

function parseAmount(raw: string): number {
  const n = Number(String(raw ?? "").replace(/[$,]/g, "").trim());
  return Number.isNaN(n) ? 0 : n;
}

function findHeaderRow(matrix: string[][]): number | null {
  for (let i = 0; i < matrix.length; i++) {
    const norms = matrix[i].map((c) => normalizeHeader(String(c)));
    const hasCustomer = norms.includes("customer");
    const hasAmountDue = norms.includes("amount_due");
    const hasBucket =
      norms.includes("current") ||
      norms.includes("cdurrent") ||
      norms.includes("period_1") ||
      norms.includes("period_2");
    if (hasCustomer && hasAmountDue && hasBucket) return i;
  }
  return null;
}

function colMapFromHeader(headerRow: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((h, i) => {
    const n = normalizeHeader(String(h));
    if (n) map.set(n, i);
  });
  return map;
}

function cell(row: string[], cols: Map<string, number>, ...keys: string[]): string {
  for (const key of keys) {
    const idx = cols.get(key);
    if (idx !== undefined) return String(row[idx] ?? "").trim();
  }
  return "";
}

const BUCKET_DEFS = [
  { keys: ["current", "cdurrent"], label: "Current", offsetDays: 7, confidence: "High Confidence" },
  { keys: ["period_1"], label: "Period 1", offsetDays: 30, confidence: "Medium Confidence" },
  { keys: ["period_2"], label: "Period 2", offsetDays: 60, confidence: "Medium Confidence" },
  { keys: ["over_due"], label: "Over Due", offsetDays: 0, confidence: "Low Confidence" },
] as const;

export function tryParseKeystrokeArAging(
  matrix: string[][],
  options: KeystrokeArParseOptions = {},
): ParseUploadResult | null {
  const headerIdx = findHeaderRow(matrix);
  if (headerIdx === null) return null;

  const cols = colMapFromHeader(matrix[headerIdx]);
  const reviewDate = options.reviewDate ?? new Date();
  const rows: ParsedUploadRow[] = [];
  let rowNumber = 1;

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const line = matrix[i];
    const customer = cell(line, cols, "customer");
    if (!customer) continue;

    const customerNumber = cell(line, cols, "number", "customer_number", "num");

    for (const bucket of BUCKET_DEFS) {
      const rawAmt = cell(line, cols, ...bucket.keys);
      const amount = parseAmount(rawAmt);
      if (amount <= 0) continue;

      rows.push({
        rowNumber: rowNumber++,
        values: {
          customer_name: customer,
          invoice_number: customerNumber ? `${customerNumber}-${bucket.label.replace(/\s+/g, "")}` : "",
          expected_amount: String(Math.round(amount * 100) / 100),
          expected_collection_date: addDays(reviewDate, bucket.offsetDays),
          collection_confidence: bucket.confidence,
          included_in_core_funding: bucket.confidence === "High Confidence" ? "true" : "false",
          factored_flag: "false",
          data_confidence: bucket.confidence,
        },
      });
    }
  }

  if (rows.length === 0) {
    throw new Error("Keystroke A/R aging detected but no bucket amounts were found.");
  }

  const warnings = [
    "Parsed as Keystroke customer bucket A/R aging (Current / Period 1 / Period 2 / Over Due).",
    `Collection dates mapped from review date (${isoDate(reviewDate)}): Current +7d, Period 1 +30d, Period 2 +60d, Over Due ASAP.`,
    "Bucket aging is approximate — QuickBooks A/R Aging Detail with invoice due dates is more accurate.",
  ];

  return {
    rows,
    mappedHeaders: {
      customer_name: "Customer",
      invoice_number: "Number + bucket",
      expected_amount: "(bucket column)",
      expected_collection_date: "(mapped from review date)",
    },
    warnings,
  };
}
