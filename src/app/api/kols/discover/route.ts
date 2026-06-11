import { NextRequest, NextResponse } from "next/server";
import { discoverKols } from "@/lib/kol-discover-service";
import type { KolCategory } from "@/lib/solana-kol-seed";

export const dynamic = "force-dynamic";

const CATEGORIES: KolCategory[] = ["builder", "trader", "news", "memecoin", "community"];

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const categoryParam = searchParams.get("category");
  const minFollowersParam = searchParams.get("minFollowers");
  const gmgnOnly = searchParams.get("gmgnOnly") === "true";
  const walletSeedOnly = searchParams.get("walletSeedOnly") === "true";

  const category =
    categoryParam && CATEGORIES.includes(categoryParam as KolCategory)
      ? (categoryParam as KolCategory)
      : undefined;

  const minFollowers = minFollowersParam ? Number(minFollowersParam) : undefined;

  try {
    const result = await discoverKols({
      category,
      minFollowers: Number.isFinite(minFollowers) ? minFollowers : undefined,
      gmgnOnly,
      walletSeedOnly,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discovery failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
