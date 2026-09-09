import * as fs from "fs";
import { getUploadDomain } from "../src/lib/ifm/upload/domains";
import { parseUploadFile } from "../src/lib/ifm/upload/parse";

const file = process.argv[2];
if (!file) process.exit(1);

const domain = getUploadDomain("ap_items")!;
const buffer = fs.readFileSync(file);
try {
  const result = parseUploadFile(buffer, file, domain);
  console.log("OK rows:", result.rows.length);
  console.log("Mapped:", result.mappedHeaders);
  console.log("Sample:", result.rows.slice(0, 5));
} catch (e) {
  console.error("FAIL:", e instanceof Error ? e.message : e);
}
