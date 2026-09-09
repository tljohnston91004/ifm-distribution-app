import type { UploadDomainId } from "./domains";
import type { ParsedUploadRow, ParseUploadResult } from "./parse";
import { formatUploadDate } from "./date-utils";

export function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cell(row: string[], colMap: Map<string, number>, ...keys: string[]): string {
  for (const key of keys) {
    const idx = colMap.get(key);
    if (idx !== undefined) return String(row[idx] ?? "").trim();
  }
  return "";
}

function findAgingHeaderRow(matrix: string[][]): number | null {
  for (let i = 0; i < matrix.length; i++) {
    const norms = matrix[i].map((c) => normalizeHeader(String(c)));
    const hasDue = norms.includes("due_date");
    const hasOpen = norms.includes("open_balance") || norms.includes("original_amount");
    const hasParty =
      norms.includes("vendor_display_name") ||
      norms.includes("customer_full_name") ||
      norms.includes("vendor") ||
      norms.includes("customer");
    if (hasDue && hasOpen && hasParty) return i;
  }
  return null;
}

function isQuickBooksAgingMatrix(matrix: string[][]): boolean {
  const text = matrix
    .slice(0, 8)
    .flat()
    .join(" ")
    .toLowerCase();
  return (
    text.includes("a/p aging detail") ||
    text.includes("a/r aging detail") ||
    text.includes("ap aging detail") ||
    text.includes("ar aging detail") ||
    text.includes("accounts payable aging detail") ||
    text.includes("accounts receivable aging detail")
  );
}

function parseAgingBucketLabel(text: string): string | null {
  const t = text.trim();
  if (!t || /^TOTAL$/i.test(t) || /total for/i.test(t)) return null;
  if (/^CURRENT$/i.test(t)) return "Current";
  const range = t.match(/(\d+)\s*-\s*(\d+)\s*days past due/i);
  if (range) return `${range[1]}-${range[2]}`;
  if (/\d+\+\s*days past due/i.test(t)) return "90+";
  if (/days past due/i.test(t)) return t;
  return null;
}

function normalizeAgingBucket(bucket: string): string {
  if (bucket === "Current") return "Current";
  if (bucket === "90+") return "90+";
  return bucket;
}

function colMapFromHeader(headerRow: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((h, i) => {
    const n = normalizeHeader(String(h));
    if (n) map.set(n, i);
  });
  return map;
}

function isTransactionRow(txType: string): boolean {
  if (!txType) return false;
  return /^(bill|invoice|check|expense|credit|vendor credit|payment)/i.test(txType);
}

function isDetailDataRow(
  line: string[],
  cols: Map<string, number>,
  domainId: UploadDomainId,
  txType: string,
): boolean {
  if (isTransactionRow(txType)) return true;
  if (txType) return false;

  const dueDate = cell(line, cols, "due_date");
  const openBalance = cell(line, cols, "open_balance", "original_amount");
  if (!dueDate || !openBalance) return false;

  if (domainId === "ap_items") {
    const vendor = cell(line, cols, "vendor_display_name", "vendor_name", "vendor");
    const billNo = cell(line, cols, "num", "bill_no", "invoice_number");
    if (!vendor || !billNo) return false;
    if (/summary|aging bucket|accounts payable/i.test(vendor)) return false;
    return true;
  }

  const customer = cell(line, cols, "customer_full_name", "customer_name", "customer");
  const invoiceNo = cell(line, cols, "num", "invoice_number", "bill_no");
  if (!customer || !invoiceNo) return false;
  if (/summary|aging bucket|accounts receivable/i.test(customer)) return false;
  return true;
}

function isSkippableRow(row: string[]): boolean {
  const joined = row.map((c) => String(c).trim()).join(" ");
  if (/total for/i.test(joined)) return true;
  if (row.some((c) => /^TOTAL$/i.test(String(c).trim()))) return true;
  if (/\b(a\/p|ap)\s+summary\b/i.test(joined)) return true;
  if (/^aging bucket$/i.test(String(row[0] ?? "").trim())) return true;
  return false;
}

export function tryParseQuickBooksAging(
  matrix: string[][],
  domainId: UploadDomainId,
): ParseUploadResult | null {
  if (domainId !== "ap_items" && domainId !== "ar_items") return null;

  const headerIdx = findAgingHeaderRow(matrix);
  if (headerIdx === null) return null;

  const headerNorms = matrix[headerIdx].map((c) => normalizeHeader(String(c)));
  const hasPartyColumn =
    headerNorms.includes("vendor_display_name") ||
    headerNorms.includes("customer_full_name") ||
    headerNorms.includes("vendor") ||
    headerNorms.includes("customer");
  if (!isQuickBooksAgingMatrix(matrix) && !hasPartyColumn) return null;

  if (domainId === "ap_items" && !headerNorms.includes("vendor_display_name") && !headerNorms.includes("vendor")) {
    return null;
  }
  if (domainId === "ar_items" && !headerNorms.includes("customer_full_name") && !headerNorms.includes("customer")) {
    return null;
  }

  const headerRow = matrix[headerIdx].map((h) => String(h).trim());
  const cols = colMapFromHeader(headerRow);
  const reportKind = domainId === "ap_items" ? "A/P" : "A/R";

  const rows: ParsedUploadRow[] = [];
  let currentBucket = "";
  const warnings: string[] = [
    `Parsed as QuickBooks ${reportKind} Aging Detail export (header row ${headerIdx + 1}).`,
  ];

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const line = matrix[i];
    if (isSkippableRow(line)) continue;

    const firstCell = String(line[0] ?? "").trim();
    const secondCell = String(line[1] ?? "").trim();
    const bucketLabel = parseAgingBucketLabel(firstCell) ?? parseAgingBucketLabel(secondCell);
    if (bucketLabel) {
      currentBucket = normalizeAgingBucket(bucketLabel);
      continue;
    }

    const txType = cell(line, cols, "transaction_type");
    const dueDateRaw = cell(line, cols, "due_date");
    const openBalance = cell(line, cols, "open_balance", "original_amount");
    const invoiceDateRaw = cell(line, cols, "date", "bill_date", "invoice_date");
    const num = cell(line, cols, "num", "bill_no", "invoice_number");

    if (!dueDateRaw || !openBalance) continue;
    if (!isDetailDataRow(line, cols, domainId, txType)) continue;

    const dueDate = formatUploadDate(dueDateRaw);
    const invoiceDate = invoiceDateRaw ? formatUploadDate(invoiceDateRaw) : "";

    const amount = Number(openBalance.replace(/[$,]/g, ""));
    if (Number.isNaN(amount) || amount === 0) continue;

    const values: Record<string, string> = {
      data_confidence: "High Confidence",
    };

    if (domainId === "ap_items") {
      const vendor = cell(line, cols, "vendor_display_name", "vendor_name", "vendor");
      if (!vendor) continue;
      values.vendor_name = vendor;
      values.invoice_number = num;
      values.amount_due = String(amount);
      values.due_date = dueDate;
      if (invoiceDate) values.invoice_date = invoiceDate;
      if (currentBucket) values.aging_bucket = currentBucket;
    } else {
      const customer = cell(line, cols, "customer_full_name", "customer_name", "customer");
      if (!customer) continue;
      values.customer_name = customer;
      values.invoice_number = num;
      values.expected_amount = String(amount);
      values.expected_collection_date = dueDate;
      values.collection_confidence = "High Confidence";
      values.included_in_core_funding = "true";
      values.factored_flag = "false";
    }

    rows.push({ rowNumber: i + 1, values });
  }

  if (rows.length === 0) {
    throw new Error(
      `QuickBooks ${reportKind} Aging Detail format detected but no bill/invoice rows were found.`,
    );
  }

  const mappedHeaders: Record<string, string> =
    domainId === "ap_items"
      ? {
          vendor_name: "Vendor display name",
          invoice_number: "Num",
          amount_due: "Open balance",
          due_date: "Due date",
          invoice_date: "Date",
          aging_bucket: "(aging section)",
        }
      : {
          customer_name: "Customer full name",
          invoice_number: "Num",
          expected_amount: "Open balance",
          expected_collection_date: "Due date",
        };

  return { rows, mappedHeaders, warnings };
}
