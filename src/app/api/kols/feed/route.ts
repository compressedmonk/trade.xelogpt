import { NextRequest, NextResponse } from "next/server";
import { buildKolFeed } from "@/lib/kol-feed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);
  const feed = await buildKolFeed(limit);
  return NextResponse.json(feed);
}
