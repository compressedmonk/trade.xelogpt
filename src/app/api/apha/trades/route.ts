import { NextRequest, NextResponse } from "next/server";
import { getAphaTrackRecord } from "@/lib/apha-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") ?? undefined;

  try {
    const data = await getAphaTrackRecord({ symbol: symbol || undefined });
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load trades";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
