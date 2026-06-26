import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { config } from "../src/config.js";
import { getConnection, getWalletAddress } from "../src/solana/wallet.js";

async function main(): Promise<void> {
  if (!config.walletPrivateKey) {
    console.error("DEGEN_WALLET_PRIVATE_KEY not set in .env");
    process.exit(1);
  }
  const address = getWalletAddress();
  const balance = await getConnection().getBalance(new PublicKey(address));
  const sol = balance / LAMPORTS_PER_SOL;
  const spendable = Math.max(0, sol - config.gasReserveSol);

  console.log(`Wallet:    ${address}`);
  console.log(`Balance:   ${sol.toFixed(6)} SOL`);
  console.log(`Reserve:   ${config.gasReserveSol} SOL`);
  console.log(`Spendable: ${spendable.toFixed(6)} SOL (max buy size)`);
  console.log(`DRY_RUN:   ${config.dryRun}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
