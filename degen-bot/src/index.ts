import { assertTradeConfig, config } from "./config.js";
import { DiscordGateway } from "./discord/gateway.js";
import { resolveUserToken } from "./discord/token.js";
import { extractDegenCa } from "./discord/ca-filter.js";
import type { DiscordMessage } from "./discord/types.js";
import { buyAllSol } from "./solana/buy-all.js";
import { getWalletAddress } from "./solana/wallet.js";
import { DegenStore } from "./journal/store.js";
import {
  formatBootMessage,
  formatBuyError,
  formatBuyResult,
  formatCaAlert,
  sendTelegram,
} from "./telegram.js";
import { startBalanceWatcher } from "./balance-watcher.js";
import { log } from "./util/logger.js";

async function handleTrigger(
  store: DegenStore,
  msg: DiscordMessage,
  mint: string,
): Promise<void> {
  const authorId = msg.author?.id ?? "";

  if (!store.claim(msg.id, mint, authorId)) {
    log.warn("trigger", `duplicate ignored msg=${msg.id} mint=${mint}`);
    return;
  }

  log.buy(`TRIGGER mint=${mint} author=${authorId} msg=${msg.id}`);
  store.logEvent("trigger", { discordMsgId: msg.id, mint, authorId });

  void sendTelegram(formatCaAlert(msg, mint));

  try {
    const result = await buyAllSol(mint);
    store.recordResult(msg.id, result);
    if (result.status === "bought") {
      log.buy(`BOUGHT ${result.solSpent} SOL → ${mint} tx=${result.txSignature} (${result.latencyMs}ms)`);
      if (result.sweep?.status === "swept") {
        log.buy(`SWEPT ${result.sweep.amount} → ${result.sweep.destWallet} tx=${result.sweep.txSignature}`);
      }
    } else if (result.status === "dry_run") {
      log.buy(`DRY_RUN would buy ${result.solSpent} SOL → ${mint}, out≈${result.outAmount} (${result.latencyMs}ms)`);
    } else {
      log.warn("buy", `skipped ${mint}: ${result.reason}`);
    }
    void sendTelegram(formatBuyResult(mint, result));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.recordError(msg.id, message);
    log.error("buy", `failed ${mint}: ${message}`);
    void sendTelegram(formatBuyError(mint, message));
  }
}

export async function runDegenBot(): Promise<void> {
  assertTradeConfig();
  const token = resolveUserToken();
  const store = new DegenStore(config.dbPath);

  log.info("boot", `degen-bot starting (${config.dryRun ? "DRY_RUN" : "LIVE"})`);
  log.info("boot", `channel=${config.channelId} watch=${[...config.watchUserIds].join(",")}`);
  if (config.walletPrivateKey) {
    log.info("boot", `wallet=${getWalletAddress()} reserve=${config.gasReserveSol} SOL slippage=${config.slippageBps}bps`);
    if (config.destWallet) log.info("boot", `sweep dest=${config.destWallet}`);
  } else if (!config.dryRun) {
    throw new Error("LIVE mode requires DEGEN_WALLET_PRIVATE_KEY");
  }

  const ctx = { channelId: config.channelId, watchUserIds: config.watchUserIds };

  const gateway = new DiscordGateway(token, {
    onReady: () => {
      log.info("boot", "watching for CA-only posts — Ctrl+C to stop");
      void sendTelegram(formatBootMessage());
    },
    onMessageCreate: (msg) => {
      const mint = extractDegenCa(msg, ctx);
      if (!mint) return;
      void handleTrigger(store, msg, mint);
    },
  });

  const shutdown = (): void => {
    log.info("boot", "shutting down");
    gateway.stop();
    store.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  gateway.start();
  startBalanceWatcher();
}

runDegenBot().catch((err) => {
  console.error(err);
  process.exit(1);
});
