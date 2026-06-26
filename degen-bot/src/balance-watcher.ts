import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { config } from "./config.js";
import { getConnection, getWalletAddressFromPrivateKey } from "./solana/wallet.js";
import { formatBalanceChange, formatWalletsSnapshot, sendTelegram } from "./telegram.js";
import { distinctWalletKeys } from "./watch-profiles.js";
import { log } from "./util/logger.js";

const MIN_NOTIFY_LAMPORTS = 10_000;

/**
 * Polls primary + extra shared wallet balances; Telegram on change.
 */
export function startBalanceWatcher(): void {
  const wallets = distinctWalletKeys();
  if (wallets.length === 0) return;

  const lastLamports = new Map<string, number>();
  let bootSnapshotSent = false;

  const tick = async (): Promise<void> => {
    const snapshot: { label: string; address: string; sol: number }[] = [];

    for (const { key, label } of wallets) {
      try {
        const address = getWalletAddressFromPrivateKey(key);
        const pubkey = new PublicKey(address);
        const bal = await getConnection().getBalance(pubkey);
        const prev = lastLamports.get(address);
        const sol = bal / LAMPORTS_PER_SOL;

        if (prev !== undefined) {
          const diff = bal - prev;
          if (Math.abs(diff) >= MIN_NOTIFY_LAMPORTS) {
            const delta = diff / LAMPORTS_PER_SOL;
            log.info("balance", `[${label}] ${delta >= 0 ? "+" : ""}${delta.toFixed(6)} SOL → ${sol.toFixed(6)}`);
            const sent = await sendTelegram(formatBalanceChange(address, sol, delta, label));
            log.info("balance", `[${label}] TG ${sent ? "sent" : "failed"}`);
          }
        }

        lastLamports.set(address, bal);
        snapshot.push({ label, address, sol });
      } catch (err) {
        log.warn("balance", err instanceof Error ? err.message : String(err));
      }
    }

    if (!bootSnapshotSent && snapshot.length === wallets.length) {
      bootSnapshotSent = true;
      const sent = await sendTelegram(formatWalletsSnapshot(snapshot));
      log.info("balance", `boot snapshot TG ${sent ? "sent" : "failed"} (${snapshot.length} wallet(s))`);
    }
  };

  void tick();
  setInterval(() => void tick(), config.balancePollMs);
  log.info("boot", `balance watcher (${wallets.length} wallet(s), every ${config.balancePollMs / 1000}s)`);
}
