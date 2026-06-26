import { assertTradeConfig, config } from "../src/config.js";
import { DegenStore } from "../src/journal/store.js";
import { sweepTokenToDest } from "../src/solana/sweep-token.js";
import { getKeypairFromPrivateKey } from "../src/solana/wallet.js";
import { sendTelegram } from "../src/telegram.js";
import { getProfileForUser, loadWatchProfiles } from "../src/watch-profiles.js";

function usage(): never {
  console.error("Usage: npm run sweep -- <mint> [discordUserId]");
  console.error("  Sweeps token from profile wallet (default: primary).");
  process.exit(1);
}

async function main(): Promise<void> {
  assertTradeConfig();
  const mint = process.argv[2]?.trim();
  const userIdArg = process.argv[3]?.trim();
  if (!mint) usage();
  if (!config.destWallet) {
    console.error("Set DEGEN_DEST_WALLET in .env (your Phantom public address).");
    process.exit(1);
  }

  const profile = userIdArg
    ? getProfileForUser(userIdArg)
    : loadWatchProfiles()[0];
  if (!profile?.walletPrivateKey) {
    console.error(`No wallet for profile ${userIdArg ?? "primary"}`);
    process.exit(1);
  }

  const wallet = getKeypairFromPrivateKey(profile.walletPrivateKey);
  console.log(`Sweep ${mint} from ${profile.tag} (${profile.userId}) → ${config.destWallet}`);
  const result = await sweepTokenToDest(mint, wallet);
  console.log(JSON.stringify(result, null, 2));

  if (result?.status === "swept") {
    const store = new DegenStore(config.dbPath);
    store.recordSweep(null, null, null, result);
    store.close();
    await sendTelegram(
      `<b>Manual sweep OK</b>\nProfil: ${profile.tag} <code>${profile.userId}</code>\nMint: <code>${mint}</code>\n→ <code>${config.destWallet}</code>\n<a href="https://solscan.io/tx/${result.txSignature}">Solscan</a>`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
