import { NextResponse } from "next/server";
import { getSyncStatus, runKolSyncCycle } from "@/lib/kol-sync-loop";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getSyncStatus());
}

export async function POST() {
  const result = await runKolSyncCycle();
  return NextResponse.json({ ...getSyncStatus(), result });
}
