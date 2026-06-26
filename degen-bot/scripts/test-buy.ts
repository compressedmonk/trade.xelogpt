import { assertTradeConfig, config } from "../src/config.js";
import { extractDegenCa } from "../src/discord/ca-filter.js";
import type { DiscordMessage } from "../src/discord/types.js";
import { DegenStore } from "../src/journal/store.js";
import { buyForProfile } from "../src/solana/buy-all.js";
import { getWalletAddressFromPrivateKey } from "../src/solana/wallet.js";
import { formatBuyResult, sendTelegram } from "../src/telegram.js";
import { allWatchUserIds, getProfileForUser, loadWatchProfiles } from "../src/watch-profiles.js";

function usage(): never {
  console.error("Usage: npm run test:buy -- <mint> [discordUserId]");
  console.error("  Simulates a CA trigger for the given user profile (default: primary).");
  process.exit(1);
}

async function main(): Promise<void> {
  assertTradeConfig();
  const mint = process.argv[2]?.trim();
  const userIdArg = process.argv[3]?.trim();
  if (!mint) usage();

  const profiles = loadWatchProfiles();
  const profile = userIdArg
    ? getProfileForUser(userIdArg)
    : profiles[0];
  if (!profile) {
    console.error(`No profile for user ${userIdArg ?? "(primary)"}`);
    process.exit(1);
  }

  const ctx = { channelId: config.channelId, watchUserIds: allWatchUserIds() };
  const msg: DiscordMessage = {
    id: `test-${Date.now()}`,
    channel_id: config.channelId,
    author: { id: profile.userId, username: "test-probe" },
    content: mint,
  };

  const matched = extractDegenCa(msg, ctx);
  console.log(`CA filter: ${matched ? "MATCH" : "NO MATCH"}`);
  if (!matched) {
    console.error("This mint would NOT trigger from Discord (wrong format/channel/user).");
    process.exit(1);
  }

  console.log(`Mode:    ${config.dryRun ? "DRY_RUN" : "LIVE"}`);
  console.log(`Profile: ${profile.tag} user=${profile.userId} buy=${profile.buyMode === "full" ? "full" : `${((profile.buyFraction ?? 0) * 100).toFixed(0)}%`}`);
  console.log(`Wallet:  ${profile.walletPrivateKey ? getWalletAddressFromPrivateKey(profile.walletPrivateKey) : "(none)"}`);
  console.log(`Mint:    ${mint}`);
  console.log("Buying...\n");

  const result = await buyForProfile(mint, profile);
  const store = new DegenStore(config.dbPath);
  if (store.claim(msg.id, mint, profile.userId)) {
    store.recordResult(msg.id, result);
  }
  store.close();
  console.log(JSON.stringify(result, null, 2));
  await sendTelegram(`<b>Test buy</b>\n${formatBuyResult(mint, result, profile)}`);

  if (result.status === "bought" || result.status === "dry_run") {
    process.exit(0);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
