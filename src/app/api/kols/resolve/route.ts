import { NextRequest, NextResponse } from "next/server";
import { normalizeTwitterUsername } from "@/lib/mention-parser";
import { resolveWalletFromGmgn } from "@/lib/kol-resolve";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { twitterUsername } = await req.json();
  if (!twitterUsername) {
    return NextResponse.json({ error: "twitterUsername required" }, { status: 400 });
  }

  const normalized = normalizeTwitterUsername(twitterUsername);
  const walletAddress = await resolveWalletFromGmgn(normalized);

  return NextResponse.json({ twitterUsername: normalized, walletAddress });
}
