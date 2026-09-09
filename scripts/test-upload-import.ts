import * as fs from "fs";
import { getUploadDomain } from "../src/lib/ifm/upload/domains";
import { parseUploadFile } from "../src/lib/ifm/upload/parse";
import { importUploadRows } from "../src/lib/ifm/upload/import";

const runId = process.argv[2];
const domainId = process.argv[3] as "ap_items" | "required_outflows" | "ar_items";
const file = process.argv[4];
if (!runId || !domainId || !file) {
  console.error("Usage: npx tsx scripts/test-upload-import.ts <runId> <domain> <file>");
  process.exit(1);
}

async function main() {
  const domain = getUploadDomain(domainId)!;
  const buffer = fs.readFileSync(file);
  try {
    const parsed = parseUploadFile(buffer, file, domain, {
      reviewDate: new Date("2026-06-02T12:00:00.000Z"),
      runwayWeeks: 13,
    });
    console.log("PARSE OK rows:", parsed.rows.length);
    console.log("warnings:", parsed.warnings);
    console.log("sample:", parsed.rows[0]?.values);

    const result = await importUploadRows(runId, domainId, parsed.rows, {
      sourceSystemName: "Test",
      sourceSystemType: "accounting",
      sourceDocumentName: file.split(/[/\\]/).pop() ?? file,
      replaceExisting: true,
    }, parsed.warnings);
    console.log("IMPORT OK:", result);
  } catch (e) {
    console.error("FAIL:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();
