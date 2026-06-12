import { NextResponse } from "next/server";
import { seedSampleRun } from "@/lib/ifm/seed";
import { computeRun } from "@/lib/ifm/compute";

// Create (or reset) the Steve's Bowling Supply sample run and calculate it.
export async function POST() {
  try {
    const runId = await seedSampleRun();
    await computeRun(runId);
    return NextResponse.json({ runId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Seed failed" },
      { status: 500 }
    );
  }
}
