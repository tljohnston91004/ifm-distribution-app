import * as fs from "fs";
import { getUploadDomain } from "../src/lib/ifm/upload/domains";
import { parseUploadFile } from "../src/lib/ifm/upload/parse";

const file = process.argv[2];
if (!file) process.exit(1);

const domain = getUploadDomain("ar_items")!;
const buffer = fs.readFileSync(file);
try {
  const result = parseUploadFile(buffer, file, domain, {
    reviewDate: new Date("2026-06-02T12:00:00.000Z"),
  });
  console.log("OK rows:", result.rows.length);
  console.log("Mapped:", result.mappedHeaders);
  console.log("Sample:", result.rows.slice(0, 3));
} catch (e) {
  console.error("FAIL:", e instanceof Error ? e.message : e);
}
