import { config } from "../src/config.js";
import { resolveUserToken } from "../src/discord/token.js";
import { extractDegenCa } from "../src/discord/ca-filter.js";
import type { DiscordMessage } from "../src/discord/types.js";

/** RKC post from screenshot (2024-05-11). */
const SCREENSHOT_CA = "7HgfXftRBBqsYtAEYcqjGLQrNJLL6Tww9ek4rE3Apump";

function snowflakeToDate(id: string): string {
  const ms = Number((BigInt(id) >> 22n) + 1420070400000n);
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

async function findInHistory(token: string, channelId: string): Promise<void> {
  const ctx = { channelId, watchUserIds: config.watchUserIds };
  let before: string | undefined;
  let scanned = 0;

  for (let page = 0; page < 100; page++) {
    const url = new URL(`https://discord.com/api/v9/channels/${channelId}/messages`);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);

    const res = await fetch(url, { headers: { Authorization: token } });
    if (!res.ok) throw new Error(`Discord API ${res.status}`);
    const batch = (await res.json()) as DiscordMessage[];
    if (!batch.length) break;
    scanned += batch.length;

    for (const msg of batch) {
      const text = (msg.content ?? "").trim();
      if (!text.includes("Apump") && !text.includes(SCREENSHOT_CA.slice(0, 12))) continue;
      if (msg.author?.id !== "242333226964746240") continue;
      const mint = extractDegenCa(msg, ctx);
      console.log("FOUND in history:");
      console.log(`  date: ${snowflakeToDate(msg.id)}`);
      console.log(`  author: ${msg.author?.username} (${msg.author?.id})`);
      console.log(`  content: ${text}`);
      console.log(`  filter: ${mint ? `MATCH → ${mint}` : "NO MATCH"}`);
      return;
    }
    before = batch[batch.length - 1].id;
    if (batch.length < 100) break;
  }
  console.log(`Not found in last ${scanned} messages (may be older or deleted).`);
}

async function main(): Promise<void> {
  const ctx = {
    channelId: config.channelId || "761740081835933709",
    watchUserIds: config.watchUserIds.size
      ? config.watchUserIds
      : new Set(["242333226964746240"]),
  };

  const synthetic: DiscordMessage = {
    id: "1",
    channel_id: ctx.channelId,
    author: { id: "242333226964746240", username: "cryptogodjohn" },
    content: SCREENSHOT_CA,
  };
  const mint = extractDegenCa(synthetic, ctx);
  console.log("=== SYNTHETIC (screenshot format) ===");
  console.log(`CA: ${SCREENSHOT_CA}`);
  console.log(`Result: ${mint ? `MATCH ✓` : "NO MATCH ✗"}\n`);

  const token = resolveUserToken();
  console.log("=== SEARCH IN CHANNEL HISTORY ===");
  await findInHistory(token, ctx.channelId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
