import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function parseWeights(raw: string): number[] {
  return raw
    .split(",")
    .map((w) => Number(w.trim()))
    .filter((n) => !Number.isNaN(n));
}

const backfillMaxAgeDays = Number(optional("BACKFILL_MAX_AGE_DAYS", "3"));

export const config = {
  guildId: optional("DISCORD_GUILD_ID", ""),
  tradesChannelId: optional("DISCORD_TRADES_CHANNEL_ID", ""),
  alertsChannelId: optional("DISCORD_ALERTS_CHANNEL_ID", ""),
  profileDir: resolve(optional("DISCORD_PROFILE_DIR", "./data/discord-profile")),
  wgBotDisplayName: optional("WG_BOT_DISPLAY_NAME", "WG Bot"),
  wgBotAuthorId: optional("WG_BOT_AUTHOR_ID", "1023602697238237195"),
  followedTraders: optional(
    "FOLLOWED_TRADERS",
    "Johnny,Woods,Eli,Michele,-Tareeq,Astekz",
  )
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean),
  spikeDurationMs: Number(optional("SPIKE_DURATION_MS", "60000")),
  spikeBackfillLimit: Number(optional("SPIKE_BACKFILL_LIMIT", "20")),
  backfillMaxAgeDays,
  backfillMaxAgeMs: backfillMaxAgeDays * 24 * 60 * 60 * 1000,
  dcaSteps: Number(optional("DCA_STEPS", "3")),
  dcaWeights: parseWeights(optional("DCA_WEIGHTS", "25,35,40")),
  entryStrategy: optional("ENTRY_STRATEGY", "dca_ladder"),
  dryRun: optional("DRY_RUN", "true").toLowerCase() !== "false",
  dbPath: resolve(optional("DB_PATH", "./data/trades.db")),
  defaultBalanceUsdt: Number(optional("DEFAULT_BALANCE_USDT", "1000")),
  defaultRiskPct: Number(optional("DEFAULT_RISK_PCT", "1")),
  maxNotionalUsdt: Number(optional("MAX_NOTIONAL_USDT", "0")),
  binanceApiKey: optional("BINANCE_API_KEY", ""),
  binanceApiSecret: optional("BINANCE_API_SECRET", ""),
  binanceTestnet: optional("BINANCE_TESTNET", "true").toLowerCase() !== "false",
  dashboardPort: Number(optional("DASHBOARD_PORT", "3847")),
  /** Do not focus Chromium on unlock/backfill (stay minimized). */
  discordKeepBackground:
    optional("DISCORD_KEEP_BACKGROUND", "true").toLowerCase() !== "false",
};

export function channelUrl(channelId: string): string {
  if (!config.guildId || !channelId) {
    throw new Error("DISCORD_GUILD_ID and channel ID required for navigation");
  }
  return `https://discord.com/channels/${config.guildId}/${channelId}`;
}

export function assertSpikeConfig(): void {
  required("DISCORD_GUILD_ID");
  if (!config.tradesChannelId && !config.alertsChannelId) {
    throw new Error("Set at least one of DISCORD_TRADES_CHANNEL_ID or DISCORD_ALERTS_CHANNEL_ID");
  }
}
