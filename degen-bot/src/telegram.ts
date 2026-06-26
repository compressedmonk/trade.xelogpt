import { config } from "./config.js";
import type { DiscordMessage } from "./discord/types.js";
import type { BuyResult } from "./solana/buy-all.js";

const TG_API = `https://api.telegram.org/bot${config.telegramBotToken}`;

export function isTelegramConfigured(): boolean {
  return config.telegramBotToken.length > 0 && config.telegramChatId.length > 0;
}

export async function sendTelegram(text: string): Promise<boolean> {
  if (!isTelegramConfigured()) return false;

  try {
    const res = await fetch(`${TG_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[tg] send failed: ${res.status} ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[tg] send error:", err instanceof Error ? err.message : err);
    return false;
  }
}

function authorLabel(msg: DiscordMessage): string {
  const a = msg.author;
  const name = a?.global_name || a?.username || "?";
  const id = a?.id ?? "?";
  return `${name} (<code>${id}</code>)`;
}

export function formatCaAlert(msg: DiscordMessage, mint: string): string {
  const lines = [
    "<b>CA találat</b>",
    "",
    `Mint: <code>${mint}</code>`,
    `User: ${authorLabel(msg)}`,
    `Msg: <code>${msg.id}</code>`,
    "",
    `<a href="https://gmgn.ai/sol/token/${mint}">GMGN</a> · <a href="https://dexscreener.com/solana/${mint}">DexScreener</a>`,
  ];
  if (mint.endsWith("pump")) {
    lines.push(`<a href="https://pump.fun/coin/${mint}">pump.fun</a>`);
  }
  return lines.join("\n");
}

export function formatBuyResult(mint: string, result: BuyResult): string {
  const mode = config.dryRun ? "DRY_RUN" : "LIVE";
  if (result.status === "bought") {
    const lines = [
      `<b>Vásárlás OK</b> (${mode})`,
      `Mint: <code>${mint}</code>`,
      `SOL: ${result.solSpent}`,
      result.outAmount ? `Out: ${result.outAmount}` : "",
      result.txSignature ? `Buy TX: <code>${result.txSignature}</code>` : "",
      `${result.latencyMs}ms`,
      result.txSignature ? `<a href="https://solscan.io/tx/${result.txSignature}">Buy Solscan</a>` : "",
    ];
    if (result.sweep?.status === "swept") {
      lines.push(
        "",
        `<b>Átküldve a tárcádba</b>`,
        `Cím: <code>${result.sweep.destWallet}</code>`,
        result.sweep.txSignature ? `Sweep TX: <code>${result.sweep.txSignature}</code>` : "",
        result.sweep.txSignature ? `<a href="https://solscan.io/tx/${result.sweep.txSignature}">Sweep Solscan</a>` : "",
      );
    } else if (result.sweep?.status === "skipped") {
      lines.push("", `Sweep: ${result.sweep.reason ?? "skipped"}`);
    } else if (!config.destWallet) {
      lines.push("", "Sweep: nincs DEGEN_DEST_WALLET — token a bot tárcán marad");
    }
    return lines.filter(Boolean).join("\n");
  }
  if (result.status === "dry_run") {
    return [
      `<b>DRY_RUN</b> — vásárlás nem történt`,
      `Mint: <code>${mint}</code>`,
      `SOL: ${result.solSpent}`,
      result.outAmount ? `Quote out: ${result.outAmount}` : "",
      `${result.latencyMs}ms`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `<b>Kihagyva</b> (${mode})`,
    `Mint: <code>${mint}</code>`,
    result.reason ?? "unknown",
  ].join("\n");
}

export function formatBootMessage(): string {
  return [
    "<b>degen-bot elindult</b>",
    `Mode: ${config.dryRun ? "DRY_RUN" : "LIVE"}`,
    `Channel: <code>${config.channelId}</code>`,
    `Watch: ${[...config.watchUserIds].map((id) => `<code>${id}</code>`).join(", ")}`,
    config.destWallet ? `Sweep → <code>${config.destWallet}</code>` : "Sweep: off (nincs DEGEN_DEST_WALLET)",
  ].join("\n");
}

export function formatBuyError(mint: string, message: string): string {
  return [`<b>Vásárlás hiba</b>`, `Mint: <code>${mint}</code>`, message].join("\n");
}

export function formatBalanceChange(address: string, sol: number, deltaSol: number): string {
  const dir = deltaSol >= 0 ? "📥 Beérkezett" : "📤 Kimenő";
  return [
    `<b>Bot tárca egyenleg változás</b>`,
    "",
    `${dir}: <b>${deltaSol >= 0 ? "+" : ""}${deltaSol.toFixed(6)} SOL</b>`,
    `Új egyenleg: <b>${sol.toFixed(6)} SOL</b>`,
    `Cím: <code>${address}</code>`,
    `<a href="https://solscan.io/account/${address}">Solscan</a>`,
  ].join("\n");
}
