import { getWalletActivity } from "@/lib/gmgn-client";
import { executeSolBuy } from "@/lib/jupiter-swap";
import { prisma } from "@/lib/prisma";
import { isSolanaConfigured, getTradingWalletAddress } from "@/lib/solana-wallet";
import { isValidSolanaAddress } from "@/lib/token-map";
import { formatTokenAlert, isTelegramConfigured, sendMessage } from "@/lib/telegram";

interface WalletTrade {
  side?: string;
  amount_usd?: number;
  timestamp?: number;
  base_address?: string;
  base_token?: { symbol?: string };
}

const TOKEN_COOLDOWN_HOURS = 24;

let pollRunning = false;
let lastPollAt: Date | null = null;
let lastPollResult: { processed: number; bought: number; skipped: number; errors: number } | null = null;

function parseActivityList(raw: unknown): WalletTrade[] {
  if (Array.isArray(raw)) return raw as WalletTrade[];
  const obj = raw as { list?: WalletTrade[]; activities?: WalletTrade[] };
  return obj.list ?? obj.activities ?? [];
}

function buildTradeId(wallet: string, timestamp: number, token: string): string {
  return `trade-${wallet}-${timestamp}-${token}`;
}

export function isKolCopyTradeEnabled(): boolean {
  return process.env.KOL_COPY_TRADE_ENABLED === "true";
}

export function getPollIntervalMs(): number {
  const raw = parseInt(process.env.KOL_COPY_TRADE_POLL_MS ?? "30000", 10);
  return Number.isFinite(raw) && raw >= 10000 ? raw : 30000;
}

export function getBotStatus() {
  return {
    enabled: isKolCopyTradeEnabled(),
    solanaConfigured: isSolanaConfigured(),
    tradingWallet: isSolanaConfigured() ? getTradingWalletAddress() : null,
    buySol: parseFloat(process.env.KOL_COPY_TRADE_BUY_SOL ?? "0.05"),
    slippageBps: parseInt(process.env.KOL_COPY_TRADE_SLIPPAGE_BPS ?? "50", 10),
    pollIntervalMs: getPollIntervalMs(),
    pollRunning,
    lastPollAt: lastPollAt?.toISOString() ?? null,
    lastPollResult,
  };
}

async function hasRecentBuyForToken(tokenAddress: string): Promise<boolean> {
  const since = new Date(Date.now() - TOKEN_COOLDOWN_HOURS * 60 * 60 * 1000);
  const existing = await prisma.tradeLog.findFirst({
    where: {
      tokenAddress,
      side: "buy",
      source: "kol_copy",
      status: { in: ["submitted", "confirmed"] },
      createdAt: { gte: since },
    },
  });
  return Boolean(existing);
}

async function processBuyTrade(params: {
  tradeId: string;
  walletAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  kolUsername: string;
  amountUsd?: number;
}): Promise<"bought" | "skipped" | "failed"> {
  const { tradeId, walletAddress, tokenAddress, tokenSymbol, kolUsername, amountUsd } = params;

  const alreadyProcessed = await prisma.processedKolTrade.findUnique({ where: { id: tradeId } });
  if (alreadyProcessed) return "skipped";

  if (await hasRecentBuyForToken(tokenAddress)) {
    await prisma.processedKolTrade.create({
      data: { id: tradeId, walletAddress, tokenAddress, side: "buy" },
    });
    return "skipped";
  }

  const buySol = parseFloat(process.env.KOL_COPY_TRADE_BUY_SOL ?? "0.05");
  const log = await prisma.tradeLog.create({
    data: {
      chain: "sol",
      tokenAddress,
      tokenSymbol,
      side: "buy",
      amountSol: buySol,
      status: "pending",
      source: "kol_copy",
      triggeredBy: walletAddress,
    },
  });

  try {
    const result = await executeSolBuy(tokenAddress);

    await prisma.tradeLog.update({
      where: { id: log.id },
      data: {
        txSignature: result.txSignature,
        status: "confirmed",
        amountToken: parseFloat(result.outAmount) / 1e6,
      },
    });

    await prisma.processedKolTrade.create({
      data: { id: tradeId, walletAddress, tokenAddress, side: "buy" },
    });

    if (isTelegramConfigured()) {
      await sendMessage(
        formatTokenAlert({
          signal: `KOL Auto-Buy (${kolUsername})`,
          symbol: tokenSymbol,
          address: tokenAddress,
          wallet: walletAddress,
          side: "buy",
          amount: amountUsd?.toFixed(0),
        }) + `\n<a href="https://solscan.io/tx/${result.txSignature}">View TX</a>`,
      );
    }

    return "bought";
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.tradeLog.update({
      where: { id: log.id },
      data: { status: "failed", errorMessage: message },
    });
    return "failed";
  }
}

export async function runKolCopyTradePoll(): Promise<{
  processed: number;
  bought: number;
  skipped: number;
  errors: number;
}> {
  if (!isKolCopyTradeEnabled()) {
    return { processed: 0, bought: 0, skipped: 0, errors: 0 };
  }
  if (!isSolanaConfigured()) {
    throw new Error("Solana not configured: set SOLANA_RPC_URL and TRADING_WALLET_PRIVATE_KEY");
  }
  if (pollRunning) {
    return lastPollResult ?? { processed: 0, bought: 0, skipped: 0, errors: 0 };
  }

  pollRunning = true;
  const stats = { processed: 0, bought: 0, skipped: 0, errors: 0 };

  try {
    const profiles = await prisma.kolProfile.findMany({
      where: { enabled: true },
      include: { wallets: true },
    });

    for (const profile of profiles) {
      for (const wallet of profile.wallets) {
        try {
          const raw = await getWalletActivity(wallet.chain, wallet.walletAddress);
          const trades = parseActivityList(raw);

          for (const trade of trades) {
            const side = (trade.side ?? "").toLowerCase();
            if (side !== "buy") continue;

            const tokenAddress = trade.base_address;
            const timestamp = trade.timestamp ?? 0;
            if (!tokenAddress || !timestamp || !isValidSolanaAddress(tokenAddress)) continue;

            stats.processed++;
            const tradeId = buildTradeId(wallet.walletAddress, timestamp, tokenAddress);

            const outcome = await processBuyTrade({
              tradeId,
              walletAddress: wallet.walletAddress,
              tokenAddress,
              tokenSymbol: trade.base_token?.symbol ?? "?",
              kolUsername: profile.twitterUsername,
              amountUsd: trade.amount_usd,
            });

            if (outcome === "bought") stats.bought++;
            else if (outcome === "skipped") stats.skipped++;
            else stats.errors++;
          }
        } catch {
          stats.errors++;
        }
      }
    }

    lastPollAt = new Date();
    lastPollResult = stats;
    return stats;
  } finally {
    pollRunning = false;
  }
}

export function startKolCopyTraderLoop(): void {
  if (!isKolCopyTradeEnabled()) {
    console.log("[kol-copy-trader] disabled (KOL_COPY_TRADE_ENABLED != true)");
    return;
  }

  const intervalMs = getPollIntervalMs();
  console.log(`[kol-copy-trader] starting poll loop every ${intervalMs}ms`);

  void runKolCopyTradePoll().catch((err) => {
    console.error("[kol-copy-trader] initial poll failed:", err);
  });

  setInterval(() => {
    void runKolCopyTradePoll().catch((err) => {
      console.error("[kol-copy-trader] poll failed:", err);
    });
  }, intervalMs);
}
