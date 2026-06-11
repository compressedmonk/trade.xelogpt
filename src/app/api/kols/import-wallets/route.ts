import { NextRequest, NextResponse } from "next/server";
import { importWalletSeedKols } from "@/lib/kol-import";
import { normalizeTwitterUsername } from "@/lib/mention-parser";
import { SOLANA_KOL_WALLET_SEED } from "@/lib/solana-kol-wallet-seed";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { all, twitterUsernames } = body as {
    all?: boolean;
    twitterUsernames?: string[];
  };

  let entries = SOLANA_KOL_WALLET_SEED;

  if (!all && Array.isArray(twitterUsernames) && twitterUsernames.length > 0) {
    const wanted = new Set(twitterUsernames.map(normalizeTwitterUsername));
    entries = SOLANA_KOL_WALLET_SEED.filter((e) =>
      wanted.has(normalizeTwitterUsername(e.twitterUsername)),
    );
  } else if (!all) {
    return NextResponse.json(
      { error: "Specify all: true or twitterUsernames[]" },
      { status: 400 },
    );
  }

  const result = await importWalletSeedKols(entries);
  return NextResponse.json(result);
}
