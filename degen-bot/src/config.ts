import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __configDir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__configDir, "../.env"), override: true });

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function parseIdSet(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export const config = {
  userToken: optional("DISCORD_USER_TOKEN", ""),
  guildId: optional("DISCORD_GUILD_ID", ""),
  channelId: optional("DEGEN_CHANNEL_ID", ""),
  watchUserIds: parseIdSet(optional("DEGEN_WATCH_USER_ID", "")),
  profileDir: resolve(optional("DISCORD_PROFILE_DIR", "./data/discord-profile")),

  telegramBotToken: optional("TELEGRAM_BOT_TOKEN", ""),
  telegramChatId: optional("TELEGRAM_CHAT_ID", ""),

  rpcUrl: optional("SOLANA_RPC_URL", ""),
  walletPrivateKey: optional("DEGEN_WALLET_PRIVATE_KEY", ""),
  /** Personal wallet — bought tokens are swept here after each buy. */
  destWallet: optional("DEGEN_DEST_WALLET", ""),
  gasReserveSol: Number(optional("DEGEN_GAS_RESERVE_SOL", "0.02")),
  slippageBps: Number(optional("DEGEN_SLIPPAGE_BPS", "1500")),
  jupiterApiKey: optional("JUPITER_API_KEY", ""),
  priorityFeeLamports: Number(optional("DEGEN_PRIORITY_FEE_LAMPORTS", "200000")),

  dryRun: optional("DRY_RUN", "true").toLowerCase() !== "false",
  minBuySol: Number(optional("DEGEN_MIN_BUY_SOL", "0.01")),
  dbPath: resolve(optional("DB_PATH", "./data/degen.db")),
  balancePollMs: Number(optional("DEGEN_BALANCE_POLL_MS", "30000")),
};

/** Throws if anything required to actually trade is missing. */
export function assertTradeConfig(): void {
  const missing: string[] = [];
  if (!config.userToken) missing.push("DISCORD_USER_TOKEN");
  if (!config.channelId) missing.push("DEGEN_CHANNEL_ID");
  if (config.watchUserIds.size === 0) missing.push("DEGEN_WATCH_USER_ID");
  if (!config.rpcUrl) missing.push("SOLANA_RPC_URL");
  if (!config.telegramBotToken) missing.push("TELEGRAM_BOT_TOKEN");
  if (!config.telegramChatId) missing.push("TELEGRAM_CHAT_ID");
  if (!config.dryRun && !config.walletPrivateKey) missing.push("DEGEN_WALLET_PRIVATE_KEY");
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
}
