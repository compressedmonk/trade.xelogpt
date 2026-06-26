import { resolveEnv } from "@/lib/shared-env";

export function getTelegramBotToken(): string {
  return resolveEnv("TELEGRAM_BOT_TOKEN");
}

export function getTelegramChatId(): string {
  return resolveEnv("TELEGRAM_CHAT_ID");
}

export function isTelegramConfigured(): boolean {
  return getTelegramBotToken().length > 0 && getTelegramChatId().length > 0;
}

export async function sendMessage(text: string, chatId?: string): Promise<boolean> {
  const token = getTelegramBotToken();
  if (!token) return false;
  const target = chatId ?? getTelegramChatId();
  if (!target) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: target,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function setWebhook(url: string): Promise<any> {
  const token = getTelegramBotToken();
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, allowed_updates: ["message"] }),
  });
  return res.json();
}

export async function deleteWebhook(): Promise<any> {
  const token = getTelegramBotToken();
  const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, { method: "POST" });
  return res.json();
}

export function formatTokenAlert(data: {
  symbol: string;
  address: string;
  price?: string;
  mcap?: string;
  signal?: string;
  wallet?: string;
  side?: string;
  amount?: string;
}): string {
  const lines = [];
  if (data.signal) lines.push(`<b>${data.signal}</b>`);
  lines.push(`<b>${data.symbol}</b>`);
  if (data.price) lines.push(`Price: ${data.price}`);
  if (data.mcap) lines.push(`MCap: ${data.mcap}`);
  if (data.wallet) lines.push(`Wallet: <code>${data.wallet.slice(0, 6)}...${data.wallet.slice(-4)}</code>`);
  if (data.side) lines.push(`Side: ${data.side.toUpperCase()}${data.amount ? ` | $${data.amount}` : ""}`);
  lines.push(`<a href="https://trade.xelogpt.com/token/${data.address}">View on Dashboard</a>`);
  lines.push(`<a href="https://gmgn.ai/sol/token/${data.address}">View on GMGN</a>`);
  return lines.join("\n");
}
