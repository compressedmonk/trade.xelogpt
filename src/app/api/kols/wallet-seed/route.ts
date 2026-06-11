import { NextResponse } from "next/server";
import { getWalletSeedStatus } from "@/lib/kol-import";
import { SOLANA_KOL_WALLET_SEED } from "@/lib/solana-kol-wallet-seed";

export const dynamic = "force-dynamic";

export async function GET() {
  const kols = await getWalletSeedStatus();
  const alreadyAdded = kols.filter((k) => k.alreadyAdded).length;
  return NextResponse.json({
    kols,
    total: SOLANA_KOL_WALLET_SEED.length,
    alreadyAdded,
    pending: SOLANA_KOL_WALLET_SEED.length - alreadyAdded,
  });
}
