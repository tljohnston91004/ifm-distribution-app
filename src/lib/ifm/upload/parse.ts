import * as XLSX from "xlsx";
import type { UploadDomainConfig, UploadDomainId } from "./domains";
import { UPLOAD_DOMAINS } from "./domains";
import { formatUploadDate } from "./date-utils";
import { tryParseQuickBooksAging } from "./quickbooks-aging";
import { tryParseQuickBooksBalanceSheet } from "./quickbooks-balance-sheet";
import { tryParseQuickBooksProfitLoss } from "./quickbooks-profit-loss";
import { tryParseKeystrokeArAging } from "./keystroke-ar-aging";

export interface ParseUploadOptions {
  reviewDate?: Date;
  runwayWeeks?: number;
}

export interface ParsedUploadRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface ParseUploadResult {
  rows: ParsedUploadRow[];
  mappedHeaders: Record<string, string>;
  warnings: string[];
}

interface SheetMatrix {
  sheetName: string;
  matrix: string[][];
}

function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildHeaderMap(headers: string[], domain: UploadDomainConfig): Record<string, string> {
  const normalized = headers.map((h) => normalizeHeader(h));
  const mapped: Record<string, string> = {};

  for (const canonical of Object.keys(domain.aliases)) {
    const aliases = domain.aliases[canonical].map(normalizeHeader);
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx >= 0) {
      mapped[canonical] = headers[idx];
    }
  }

  return mapped;
}

function matrixFromSheet(sheet: XLSX.WorkSheet): string[][] {
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
  return matrix.filter((row) => row.some((cell) => String(cell).trim() !== ""));
}

function workbookSheets(buffer: Buffer, filename: string): SheetMatrix[] {
  const isCsv = filename.toLowerCase().endsWith(".csv");
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    raw: false,
    cellDates: false,
    ...(isCsv ? { FS: ",", RS: "\n" } : {}),
  });

  return workbook.SheetNames.map((sheetName) => ({
    sheetName,
    matrix: matrixFromSheet(workbook.Sheets[sheetName]),
  })).filter((s) => s.matrix.length >= 2);
}

function tryStructuredParse(
  domain: UploadDomainConfig,
  matrix: string[][],
  options: ParseUploadOptions,
): ParseUploadResult | null {
  if (domain.id === "cash_positions") {
    const r = tryParseQuickBooksBalanceSheet(matrix);
    if (r) return r;
  }

  if (domain.id === "required_outflows") {
    const r = tryParseQuickBooksProfitLoss(matrix, {
      reviewDate: options.reviewDate ?? new Date(),
      runwayWeeks: options.runwayWeeks ?? 13,
    });
    if (r) return r;
  }

  if (domain.id === "ap_items" || domain.id === "ar_items") {
    const r = tryParseQuickBooksAging(matrix, domain.id);
    if (r) return r;
  }

  if (domain.id === "ar_items") {
    const r = tryParseKeystrokeArAging(matrix, { reviewDate: options.reviewDate });
    if (r) return r;
  }

  return null;
}

/** Detect QB / Keystroke report type for helpful wrong-card errors. */
function detectReportDomain(
  matrix: string[][],
  options: ParseUploadOptions,
): UploadDomainId | null {
  if (tryParseQuickBooksBalanceSheet(matrix)) return "cash_positions";
  if (
    tryParseQuickBooksProfitLoss(matrix, {
      reviewDate: options.reviewDate ?? new Date(),
      runwayWeeks: options.runwayWeeks ?? 13,
    })
  ) {
    return "required_outflows";
  }
  if (tryParseQuickBooksAging(matrix, "ap_items")) return "ap_items";
  if (tryParseKeystrokeArAging(matrix, { reviewDate: options.reviewDate })) return "ar_items";
  if (tryParseQuickBooksAging(matrix, "ar_items")) return "ar_items";
  return null;
}

function domainLabel(id: UploadDomainId): string {
  return UPLOAD_DOMAINS.find((d) => d.id === id)?.label ?? id;
}

function parseGenericCsv(matrix: string[][], domain: UploadDomainConfig): ParseUploadResult {
  const headers = matrix[0].map((h) => String(h).trim());
  const mappedHeaders = buildHeaderMap(headers, domain);
  const warnings: string[] = [];

  for (const required of domain.requiredColumns) {
    if (!mappedHeaders[required]) {
      throw new Error(
        `Missing required column "${required}". Expected one of: ${domain.aliases[required]?.join(", ") ?? required}`,
      );
    }
  }

  const unmapped = headers.filter((h) => {
    const n = normalizeHeader(h);
    return n && !Object.values(mappedHeaders).some((orig) => normalizeHeader(orig) === n);
  });
  if (unmapped.length > 0) {
    warnings.push(`Unmapped columns ignored: ${unmapped.join(", ")}`);
  }

  const rows: ParsedUploadRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const line = matrix[i];
    const values: Record<string, string> = {};
    let hasData = false;
    for (const [canonical, sourceHeader] of Object.entries(mappedHeaders)) {
      const colIdx = headers.indexOf(sourceHeader);
      const cell = colIdx >= 0 ? String(line[colIdx] ?? "").trim() : "";
      if (cell) hasData = true;
      values[canonical] = cell;
    }
    if (!hasData) continue;
    rows.push({ rowNumber: i + 1, values });
  }

  if (rows.length === 0) {
    throw new Error("No data rows found after the header.");
  }

  return { rows, mappedHeaders, warnings };
}

export function parseUploadFile(
  buffer: Buffer,
  filename: string,
  domain: UploadDomainConfig,
  options: ParseUploadOptions = {},
): ParseUploadResult {
  const sheets = workbookSheets(buffer, filename);
  if (sheets.length === 0) {
    throw new Error("File must include a header row and at least one data row.");
  }

  let detectedElsewhere: UploadDomainId | null = null;

  for (const { sheetName, matrix } of sheets) {
    const result = tryStructuredParse(domain, matrix, options);
    if (result) {
      if (sheetName && sheets.length > 1) {
        result.warnings.unshift(`Using worksheet "${sheetName}".`);
      }
      return result;
    }

    const detected = detectReportDomain(matrix, options);
    if (detected && detected !== domain.id) {
      detectedElsewhere = detected;
    }
  }

  if (detectedElsewhere) {
    throw new Error(
      `This file looks like ${domainLabel(detectedElsewhere)} data. Upload it under the "${domainLabel(detectedElsewhere)}" card — not "${domain.label}".`,
    );
  }

  // Generic CSV template path — first worksheet only
  try {
    return parseGenericCsv(sheets[0].matrix, domain);
  } catch (genericErr) {
    const hint =
      domain.id === "cash_positions"
        ? "Use your QuickBooks Balance Sheet .xlsx (e.g. Syds_Sewing_Supply_QB_Balance_Sheet_May_2026.xlsx)."
        : domain.id === "ap_items"
          ? "Use your QuickBooks A/P Aging Detail .xlsx (e.g. Syds_Sewing_Supply_QB_AP_Detail_May_2026.xlsx)."
          : domain.id === "required_outflows"
            ? "Use your QuickBooks Profit & Loss .xlsx (e.g. Syds_Sewing_Supply_QB_Profit_and_Loss_May_2026.xlsx)."
            : domain.id === "ar_items"
              ? "Use Keystroke AR.xls or QuickBooks A/R Aging Detail .xlsx."
              : "Use the IFM CSV template for this domain.";
    const base = genericErr instanceof Error ? genericErr.message : "Could not parse file.";
    throw new Error(`${base} ${hint}`);
  }
}

export function parseDate(value: string, field: string, rowNumber: number): Date {
  const v = value.trim();
  if (!v) throw new Error(`Row ${rowNumber}: ${field} is required.`);
  const normalized = formatUploadDate(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return new Date(`${normalized}T12:00:00.000Z`);
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Row ${rowNumber}: invalid date for ${field} ("${value}"). Use YYYY-MM-DD.`);
  }
  return parsed;
}

export function parseNumber(value: string, field: string, rowNumber: number, required = true): number {
  const v = value.replace(/[$,]/g, "").trim();
  if (!v) {
    if (!required) return 0;
    throw new Error(`Row ${rowNumber}: ${field} is required.`);
  }
  const n = Number(v);
  if (Number.isNaN(n)) {
    throw new Error(`Row ${rowNumber}: invalid number for ${field} ("${value}").`);
  }
  return n;
}

export function parseBoolean(value: string, defaultValue = false): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return defaultValue;
  if (["true", "yes", "y", "1"].includes(v)) return true;
  if (["false", "no", "n", "0"].includes(v)) return false;
  return defaultValue;
}

export function parseConfidence(value: string | undefined, fallback = "Medium Confidence"): string {
  const v = (value ?? "").trim();
  if (!v) return fallback;
  if (v === "High" || v === "Medium" || v === "Low") return `${v} Confidence`;
  if (v.endsWith("Confidence")) return v;
  return fallback;
}
