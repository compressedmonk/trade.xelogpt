import { NextResponse } from "next/server";
import { buildKolMentionedTokens } from "@/lib/kol-tokens";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await buildKolMentionedTokens();
  return NextResponse.json(rows);
}
