import { NextRequest, NextResponse } from "next/server";
import { getKlines } from "@/lib/apha-binance";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  const startTime = req.nextUrl.searchParams.get("startTime");
  const endTime = req.nextUrl.searchParams.get("endTime");
  const interval = req.nextUrl.searchParams.get("interval") || "1h";

  if (!symbol || !startTime || !endTime) {
    return NextResponse.json({ error: "symbol, startTime, endTime required" }, { status: 400 });
  }

  try {
    const bars = await getKlines(
      symbol,
      interval,
      Number(startTime),
      Number(endTime),
      500,
    );

    const list = bars.map((b) => ({
      time: b.openTime,
      open: String(b.open),
      high: String(b.high),
      low: String(b.low),
      close: String(b.close),
      volume: String(b.volume),
    }));

    return NextResponse.json({ list }, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Kline fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
