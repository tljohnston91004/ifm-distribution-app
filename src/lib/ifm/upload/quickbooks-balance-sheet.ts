import type { ParsedUploadRow, ParseUploadResult } from "./parse";
import { normalizeHeader } from "./quickbooks-aging";

function isQuickBooksBalanceSheet(matrix: string[][]): boolean {
  const text = matrix
    .slice(0, 6)
    .flat()
    .join(" ")
    .toLowerCase();
  return text.includes("balance sheet");
}

function parseAsOfDate(matrix: string[][]): string {
  for (let i = 0; i < Math.min(8, matrix.length); i++) {
    for (const cell of matrix[i]) {
      const t = String(cell).trim();
      const match = t.match(/^As of\s+(.+)$/i);
      if (!match) continue;
      const d = new Date(match[1]);
      if (Number.isNaN(d.getTime())) {
        throw new Error(`Could not parse Balance Sheet as-of date: "${match[1]}"`);
      }
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }
  throw new Error("QuickBooks Balance Sheet detected but as-of date was not found.");
}

function parseAmountCell(raw: string): number | null {
  const cleaned = String(raw ?? "")
    .replace(/[$,]/g, "")
    .replace(/^\((.+)\)$/, "-$1")
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (Number.isNaN(n)) return null;
  return n;
}

function rowAmount(row: string[]): number | null {
  // QB standard reports put the primary amount in column B (index 1).
  if (row.length > 1) {
    const primary = parseAmountCell(String(row[1] ?? ""));
    if (primary !== null) return primary;
  }
  for (let i = row.length - 1; i >= 1; i--) {
    const n = parseAmountCell(String(row[i] ?? ""));
    if (n !== null) return n;
  }
  return null;
}

function rowLabel(row: string[]): string {
  return String(row[0] ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function isBankAccountsTotalLabel(label: string): boolean {
  return /^total for bank accounts$/i.test(label) || /^total checking\/savings$/i.test(label);
}

function isBankAccountsSectionLabel(label: string): boolean {
  return /^bank accounts$/i.test(label) || /^checking\/savings$/i.test(label);
}

function findBankAccountsTotal(matrix: string[][]): { amount: number; sourceLabel: string } | null {
  for (const row of matrix) {
    const label = rowLabel(row);
    if (isBankAccountsTotalLabel(label)) {
      const amount = rowAmount(row);
      if (amount !== null) return { amount, sourceLabel: label };
    }
  }

  let inBankSection = false;
  let sum = 0;
  let foundLines = 0;

  for (const row of matrix) {
    const label = rowLabel(row);
    if (isBankAccountsSectionLabel(label)) {
      inBankSection = true;
      continue;
    }
    if (!inBankSection) continue;

    if (isBankAccountsTotalLabel(label)) {
      const total = rowAmount(row);
      return { amount: total ?? sum, sourceLabel: label };
    }
    if (/^total for /i.test(label) || /^accounts receivable$/i.test(label)) {
      break;
    }

    const amount = rowAmount(row);
    if (label && amount !== null && !/^total/i.test(label)) {
      sum += amount;
      foundLines += 1;
    }
  }

  return foundLines > 0 ? { amount: Math.round(sum * 100) / 100, sourceLabel: "Checking/Savings (summed)" } : null;
}

function findUndepositedFunds(matrix: string[][]): number | null {
  for (const row of matrix) {
    if (/^undeposited funds$/i.test(rowLabel(row))) {
      return rowAmount(row);
    }
  }
  return null;
}

export function tryParseQuickBooksBalanceSheet(matrix: string[][]): ParseUploadResult | null {
  if (!isQuickBooksBalanceSheet(matrix)) return null;

  const asOf = parseAsOfDate(matrix);
  const bank = findBankAccountsTotal(matrix);
  if (bank === null) {
    throw new Error(
      "QuickBooks Balance Sheet detected but Bank Accounts total was not found. Look for 'Total for Bank Accounts' or 'Total Checking/Savings'.",
    );
  }

  const warnings: string[] = [
    `Parsed as QuickBooks Balance Sheet export (as of ${asOf}). Using ${bank.sourceLabel}.`,
  ];

  const undeposited = findUndepositedFunds(matrix);
  if (undeposited !== null && undeposited > 0) {
    warnings.push(
      `Undeposited Funds ($${undeposited.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) is not included in cash — it is not double-counted with AR.`,
    );
  }

  const values: Record<string, string> = {
    cash_as_of_date: asOf,
    cash_on_hand: String(bank.amount),
    available_operating_cash: String(bank.amount),
    data_source: "QuickBooks Balance Sheet",
    data_confidence: "High Confidence",
  };

  const rows: ParsedUploadRow[] = [{ rowNumber: 1, values }];

  return {
    rows,
    mappedHeaders: {
      cash_as_of_date: "As of (report header)",
      cash_on_hand: bank.sourceLabel,
      available_operating_cash: bank.sourceLabel,
      data_source: "(auto)",
      data_confidence: "(auto)",
    },
    warnings,
  };
}

/** Used by tests to validate detection without full matrix title. */
export function looksLikeBalanceSheetAccountGrid(matrix: string[][]): boolean {
  const labels = matrix.map((r) => normalizeHeader(rowLabel(r)));
  return (
    labels.includes("bank_accounts") ||
    labels.some((l) => /total_for_bank_accounts/.test(l)) ||
    labels.some((l) => /total_checking_savings/.test(l))
  );
}
