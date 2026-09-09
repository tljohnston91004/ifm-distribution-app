import { execSync } from "child_process";
import { NextResponse } from "next/server";
import { resetIfmDatabase } from "@/lib/ifm/reset-database";

/** Wipe all IFM runs, companies, and calculations. Dev/pilot use only. */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DATA_RESET !== "true") {
    return NextResponse.json({ error: "Data reset is disabled in production." }, { status: 403 });
  }

  let includeRse = false;
  try {
    const body = (await req.json()) as { includeRse?: boolean };
    includeRse = Boolean(body.includeRse);
  } catch {
    // empty body is fine
  }

  try {
    const result = await resetIfmDatabase();
    execSync("npx prisma db push", { stdio: "pipe", cwd: process.cwd() });

    let rse: { ok: boolean; message: string } | undefined;
    if (includeRse) {
      const base = (process.env.RSE_API_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
      try {
        const res = await fetch(`${base}/api/reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true, includePre: true }),
        });
        rse = res.ok
          ? { ok: true, message: "RSE reset API succeeded." }
          : { ok: false, message: `RSE returned ${res.status}. Delete data/rse.db manually.` };
      } catch {
        rse = {
          ok: false,
          message: "RSE not reachable. Stop RSE, delete data/rse.db, run db:push, restart.",
        };
      }
    }

    return NextResponse.json({
      ok: true,
      message: "IFM database wiped and schema recreated.",
      ...result,
      rse,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reset failed" },
      { status: 500 },
    );
  }
}
