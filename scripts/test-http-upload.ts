import * as fs from "fs";
import * as path from "path";

const runId = process.argv[2];
const domain = process.argv[3];
const filePath = process.argv[4];
if (!runId || !domain || !filePath) {
  console.error("Usage: npx tsx scripts/test-http-upload.ts <runId> <domain> <file>");
  process.exit(1);
}

async function main() {
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("domain", domain);
  form.append("sourceSystemName", "QuickBooks");
  form.append("sourceSystemType", "accounting");
  form.append("replaceExisting", "true");
  form.append("file", new Blob([buf]), path.basename(filePath));

  const res = await fetch(`http://localhost:3001/api/runs/${runId}/upload`, {
    method: "POST",
    body: form,
  });
  const text = await res.text();
  console.log("status:", res.status);
  console.log(text);
}

main();
