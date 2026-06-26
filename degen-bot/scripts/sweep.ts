import { assertTradeConfig, config } from "../src/config.js";
import { DegenStore } from "../src/journal/store.js";
import { sweepTokenToDest } from "../src/solana/sweep-token.js";
import { sendTelegram } from "../src/telegram.js";

function usage(): never {
  console.error("Usage: npm run sweep -- <mint>");
  process.exit(1);
}

async function main(): Promise<void> {
  assertTradeConfig();
  const mint = process.argv[2]?.trim();
  if (!mint) usage();
  if (!config.destWallet) {
    console.error("Set DEGEN_DEST_WALLET in .env (your Phantom public address).");
    process.exit(1);
  }

  console.log(`Sweep ${mint} → ${config.destWallet}`);
  const result = await sweepTokenToDest(mint);
  console.log(JSON.stringify(result, null, 2));

  if (result?.status === "swept") {
    const store = new DegenStore(config.dbPath);
    store.recordSweep(null, null, null, result);
    store.close();
    await sendTelegram(
      `<b>Manual sweep OK</b>\nMint: <code>${mint}</code>\n→ <code>${config.destWallet}</code>\n<a href="https://solscan.io/tx/${result.txSignature}">Solscan</a>`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
