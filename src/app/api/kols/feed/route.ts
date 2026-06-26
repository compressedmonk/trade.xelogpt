import { NextRequest, NextResponse } from "next/server";
import { buildKolFeed } from "@/lib/kol-feed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);
  const profileTypeParam = req.nextUrl.searchParams.get("profileType");
  const profileType =
    profileTypeParam === "newsmaker" || profileTypeParam === "trader"
      ? profileTypeParam
      : undefined;
  const feed = await buildKolFeed(limit, profileType);
  return NextResponse.json(feed);
}
