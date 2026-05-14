import { NextRequest, NextResponse } from "next/server";
import { sendMessage, formatTokenAlert, isTelegramConfigured } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isTelegramConfigured()) {
    return NextResponse.json({ error: "Telegram not configured" }, { status: 400 });
  }

  const body = await req.json();
  const text = formatTokenAlert(body);
  const ok = await sendMessage(text);
  return NextResponse.json({ ok });
}
