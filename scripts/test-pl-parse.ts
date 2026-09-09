import * as fs from "fs";
import * as XLSX from "xlsx";
import { tryParseQuickBooksProfitLoss } from "../src/lib/ifm/upload/quickbooks-profit-loss";

const file = process.argv[2];
if (!file) process.exit(1);

const wb = XLSX.readFile(file);
const matrix = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });

const result = tryParseQuickBooksProfitLoss(matrix, {
  reviewDate: new Date("2026-06-18T12:00:00.000Z"),
  runwayWeeks: 13,
});

if (!result) {
  console.error("FAIL: not detected");
  process.exit(1);
}

console.log("Rows:", result.rows.length);
console.log("Warnings:", result.warnings);
const byWeek = new Map<string, number>();
for (const r of result.rows) {
  const w = r.values.due_date;
  byWeek.set(w, (byWeek.get(w) ?? 0) + Number(r.values.amount));
}
console.log("Weekly totals:");
[...byWeek.entries()].sort().slice(0, 5).forEach(([d, a]) => console.log(d, a.toFixed(2)));
console.log("Sample rows:", result.rows.slice(0, 3));
