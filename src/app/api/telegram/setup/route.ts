import { NextResponse } from "next/server";
import { setWebhook, isTelegramConfigured } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isTelegramConfigured()) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID not set" }, { status: 400 });
  }

  const webhookUrl = "https://trade.xelogpt.com/api/telegram";
  const result = await setWebhook(webhookUrl);
  return NextResponse.json({ webhookUrl, result });
}
