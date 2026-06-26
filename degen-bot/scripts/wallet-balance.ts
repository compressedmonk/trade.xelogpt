import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { config } from "../src/config.js";
import { getConnection, getWalletAddressFromPrivateKey } from "../src/solana/wallet.js";
import { loadWatchProfiles } from "../src/watch-profiles.js";

async function printWallet(label: string, privateKey: string, buyLabel: string): Promise<void> {
  const address = getWalletAddressFromPrivateKey(privateKey);
  const balance = await getConnection().getBalance(new PublicKey(address));
  const sol = balance / LAMPORTS_PER_SOL;
  const spendable = Math.max(0, sol - config.gasReserveSol);

  console.log(`[${label}]`);
  console.log(`  Wallet:    ${address}`);
  console.log(`  Balance:   ${sol.toFixed(6)} SOL`);
  console.log(`  Spendable: ${spendable.toFixed(6)} SOL`);
  console.log(`  Buy:       ${buyLabel}`);
  console.log("");
}

async function main(): Promise<void> {
  const profiles = loadWatchProfiles();
  console.log(`DRY_RUN: ${config.dryRun}\n`);

  const primary = profiles.find((p) => p.tag === "primary");
  if (primary?.walletPrivateKey) {
    await printWallet("primary", primary.walletPrivateKey, "full spendable");
  }

  const extras = profiles.filter((p) => p.tag === "extra");
  if (extras.length > 0 && extras[0]!.walletPrivateKey) {
    const key = extras[0]!.walletPrivateKey;
    const address = getWalletAddressFromPrivateKey(key);
    const balance = await getConnection().getBalance(new PublicKey(address));
    const spendable = Math.max(0, balance / LAMPORTS_PER_SOL - config.gasReserveSol);

    await printWallet("extra (shared)", key, "per-user % below");
    for (const e of extras) {
      const pct = (e.buyFraction ?? 0) * 100;
      const buySol = spendable * (e.buyFraction ?? 0);
      console.log(`  extra user ${e.userId} → ${pct.toFixed(0)}% ≈ ${buySol.toFixed(6)} SOL / trigger`);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
