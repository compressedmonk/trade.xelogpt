import { NextResponse } from "next/server";
import { collectHealthSnapshot } from "@/lib/health-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await collectHealthSnapshot();
  return NextResponse.json(snapshot);
}
