#!/usr/bin/env npx tsx
/**
 * Wipe IFM test data and optionally request a reset on the sibling RSE app (includes PRE).
 *
 * Usage:
 *   npm run reset:data              # IFM only
 *   npm run reset:data -- --rse     # IFM + call RSE reset API if running
 *   npm run reset:data -- --all     # same as --rse
 */

import { execSync } from "child_process";
import { resetIfmDatabase } from "../src/lib/ifm/reset-database";

const RSE_BASE = (process.env.RSE_API_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const tryRse = process.argv.includes("--rse") || process.argv.includes("--all");

async function tryResetRse(): Promise<void> {
  const candidates = [
    { method: "POST", path: "/api/reset" },
    { method: "POST", path: "/api/admin/reset" },
    { method: "POST", path: "/api/dev/reset" },
  ] as const;

  for (const { method, path } of candidates) {
    try {
      const res = await fetch(`${RSE_BASE}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, includePre: true }),
      });
      if (res.ok) {
        console.log(`RSE reset OK via ${method} ${path}`);
        return;
      }
    } catch {
      // try next endpoint
    }
  }

  console.log("");
  console.log("RSE / PRE could not be reset automatically (app not running or no reset API).");
  console.log("Manual reset on your machine:");
  console.log("  1. Stop RSE (close Start RSE.bat / dev server on port 3000).");
  console.log("  2. Delete the RSE SQLite file (typically data/rse.db in the RSE app folder).");
  console.log("  3. Run: npm run db:push   (inside the RSE app directory).");
  console.log("  4. Restart RSE.");
  console.log("PRE data lives inside RSE — clearing RSE clears PRE runs and lines.");
}

async function main() {
  console.log("Resetting IFM database…");
  const { databasePath, uploadsCleared } = await resetIfmDatabase();
  execSync("npx prisma db push", { stdio: "inherit", cwd: process.cwd() });

  console.log("");
  console.log("IFM reset complete.");
  if (databasePath) console.log(`  Database: ${databasePath} (recreated empty)`);
  if (uploadsCleared) console.log("  Uploads: cleared");

  if (tryRse) {
    console.log("");
    console.log(`Attempting RSE reset at ${RSE_BASE}…`);
    await tryResetRse();
  } else {
    console.log("");
    console.log("Tip: run with --rse to also attempt RSE/PRE reset when RSE is running.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
