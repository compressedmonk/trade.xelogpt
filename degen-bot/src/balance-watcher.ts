import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { config } from "./config.js";
import { getConnection, getWalletAddress } from "./solana/wallet.js";
import { formatBalanceChange, sendTelegram } from "./telegram.js";
import { log } from "./util/logger.js";

const MIN_NOTIFY_LAMPORTS = 10_000; // ignore dust < 0.00001 SOL

/**
 * Polls bot wallet balance and sends Telegram when it changes (deposits,
 * withdrawals, post-buy fee spend). Not an external webhook — simple interval.
 */
export function startBalanceWatcher(): void {
  if (!config.walletPrivateKey) return;

  let lastLamports: number | null = null;
  const address = getWalletAddress();
  const pubkey = new PublicKey(address);

  const tick = async (): Promise<void> => {
    try {
      const bal = await getConnection().getBalance(pubkey);

      if (lastLamports !== null) {
        const diff = bal - lastLamports;
        if (Math.abs(diff) >= MIN_NOTIFY_LAMPORTS) {
          const sol = bal / LAMPORTS_PER_SOL;
          const delta = diff / LAMPORTS_PER_SOL;
          log.info("balance", `${delta >= 0 ? "+" : ""}${delta.toFixed(6)} SOL → ${sol.toFixed(6)}`);
          void sendTelegram(formatBalanceChange(address, sol, delta));
        }
      }
      lastLamports = bal;
    } catch (err) {
      log.warn("balance", err instanceof Error ? err.message : String(err));
    }
  };

  void tick();
  setInterval(() => void tick(), config.balancePollMs);
  log.info("boot", `balance watcher every ${config.balancePollMs / 1000}s`);
}
