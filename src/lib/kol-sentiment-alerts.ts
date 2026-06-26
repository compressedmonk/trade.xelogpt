import { computeMacroSentiment, type MacroSentimentResult } from "@/lib/kol-sentiment-index";
import { isTelegramConfigured, sendMessage } from "@/lib/telegram";

const lastAlertAt = new Map<string, number>();

export function isSurgeAlertEnabled(): boolean {
  return process.env.KOL_SURGE_ALERT_ENABLED !== "false";
}

function getAlertCooldownMs(): number {
  const raw = parseInt(process.env.KOL_SURGE_ALERT_COOLDOWN_MS ?? "1800000", 10);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : 1_800_000;
}

export function formatSurgeAlert(macro: MacroSentimentResult): string {
  const surgeLabel =
    macro.surge === "risk_off" ? "RISK-OFF SURGE" : "BEARISH SURGE";

  const lines = [
    `<b>⚠️ Crypto Mood Alert: ${surgeLabel}</b>`,
    "",
    `Index: <b>${macro.index > 0 ? "+" : ""}${macro.index}</b> (${macro.label.toUpperCase()})`,
    `1h momentum: ${macro.momentum1h > 0 ? "+" : ""}${macro.momentum1h}`,
    `Posts (48h): ${macro.postCount}`,
  ];

  const bearishRecent = macro.recentPosts
    .filter((p) => p.cryptoSentiment === "bearish")
    .slice(0, 4);

  if (bearishRecent.length > 0) {
    lines.push("", "<b>Recent bearish signals:</b>");
    for (const p of bearishRecent) {
      const tag = p.topicCategory === "macro_market" ? "MACRO" : "CRYPTO";
      const reason = p.reasoning ? ` — ${p.reasoning.slice(0, 80)}` : "";
      lines.push(`• @${p.twitterUsername} [${tag}]${reason}`);
    }
  }

  lines.push("", `<a href="https://trade.xelogpt.com/sentiment">Open KOL Mood Dashboard</a>`);
  return lines.join("\n");
}

export async function checkAndSendSurgeAlert(): Promise<boolean> {
  if (!isSurgeAlertEnabled() || !isTelegramConfigured()) return false;

  const macro = await computeMacroSentiment();
  if (!macro.surge) return false;

  const cooldown = getAlertCooldownMs();
  const last = lastAlertAt.get(macro.surge) ?? 0;
  if (Date.now() - last < cooldown) return false;

  const sent = await sendMessage(formatSurgeAlert(macro));
  if (sent) {
    lastAlertAt.set(macro.surge, Date.now());
    console.log(`[kol-sentiment] surge alert sent: ${macro.surge}`);
  }
  return sent;
}
