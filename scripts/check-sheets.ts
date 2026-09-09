import * as XLSX from "xlsx";

const files = process.argv.slice(2);
for (const f of files) {
  const wb = XLSX.readFile(f);
  console.log(f.split(/[/\\]/).pop(), "-> first:", wb.SheetNames[0], "| all:", wb.SheetNames.join(", "));
}
