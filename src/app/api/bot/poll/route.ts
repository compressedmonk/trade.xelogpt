import { NextResponse } from "next/server";
import { runKolCopyTradePoll } from "@/lib/kol-copy-trader";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await runKolCopyTradePoll();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
