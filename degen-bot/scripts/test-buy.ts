import { assertTradeConfig, config } from "../src/config.js";
import { extractDegenCa } from "../src/discord/ca-filter.js";
import type { DiscordMessage } from "../src/discord/types.js";
import { DegenStore } from "../src/journal/store.js";
import { buyAllSol } from "../src/solana/buy-all.js";
import { getWalletAddress } from "../src/solana/wallet.js";
import { formatBuyResult, sendTelegram } from "../src/telegram.js";

function usage(): never {
  console.error("Usage: npm run test:buy -- <mint>");
  console.error("  Simulates a CA trigger and runs the same buy path as production.");
  process.exit(1);
}

async function main(): Promise<void> {
  assertTradeConfig();
  const mint = process.argv[2]?.trim();
  if (!mint) usage();

  const ctx = { channelId: config.channelId, watchUserIds: config.watchUserIds };
  const watchId = [...config.watchUserIds][0];
  const msg: DiscordMessage = {
    id: `test-${Date.now()}`,
    channel_id: config.channelId,
    author: { id: watchId, username: "test-probe" },
    content: mint,
  };

  const matched = extractDegenCa(msg, ctx);
  console.log(`CA filter: ${matched ? "MATCH" : "NO MATCH"}`);
  if (!matched) {
    console.error("This mint would NOT trigger from Discord (wrong format/channel/user).");
    process.exit(1);
  }

  console.log(`Mode:    ${config.dryRun ? "DRY_RUN" : "LIVE"}`);
  console.log(`Wallet:  ${config.walletPrivateKey ? getWalletAddress() : "(none)"}`);
  console.log(`Mint:    ${mint}`);
  console.log("Buying...\n");

  const result = await buyAllSol(mint);
  const store = new DegenStore(config.dbPath);
  if (store.claim(msg.id, mint, watchId)) {
    store.recordResult(msg.id, result);
  }
  store.close();
  console.log(JSON.stringify(result, null, 2));
  await sendTelegram(`<b>Test buy</b>\n${formatBuyResult(mint, result)}`);

  if (result.status === "bought" || result.status === "dry_run") {
    process.exit(0);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
