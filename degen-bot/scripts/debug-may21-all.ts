import { config } from "../src/config.js";
import { resolveUserToken } from "../src/discord/token.js";
import { extractDegenCa } from "../src/discord/ca-filter.js";
import type { DiscordMessage } from "../src/discord/types.js";

const SOL_CA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function snowflakeMs(id: string): number {
  return Number((BigInt(id) >> 22n) + 1420070400000n);
}

async function main(): Promise<void> {
  const token = resolveUserToken();
  const channelId = config.channelId;
  const ctx = { channelId, watchUserIds: config.watchUserIds };
  // 2026-05-21 full day in Europe/Budapest ≈ UTC+2 → use wide UTC window
  const start = Date.UTC(2026, 4, 20, 20, 0, 0);
  const end = Date.UTC(2026, 4, 22, 4, 0, 0);
  let before: string | undefined;
  const all: DiscordMessage[] = [];

  for (let page = 0; page < 150; page++) {
    const url = new URL(`https://discord.com/api/v9/channels/${channelId}/messages`);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);
    const res = await fetch(url, { headers: { Authorization: token } });
    const batch = (await res.json()) as DiscordMessage[];
    if (!batch.length) break;
    for (const msg of batch) {
      const ts = snowflakeMs(msg.id);
      if (ts >= start && ts <= end) all.push(msg);
    }
    if (snowflakeMs(batch[batch.length - 1].id) < start) break;
    before = batch[batch.length - 1].id;
  }

  console.log(`All channel messages May21 window: ${all.length}\n`);

  for (const msg of all.sort((a, b) => snowflakeMs(a.id) - snowflakeMs(b.id))) {
    const text = (msg.content ?? "").trim();
    const user = msg.author?.username ?? "?";
    const isJohn = msg.author?.id === "242333226964746240";
    const match = extractDegenCa(msg, ctx);
    const hasCa = SOL_CA.test(text) || /[1-9A-HJ-NP-Za-km-z]{32,44}/.test(text);
    const hasPumpLink = /pump\.fun|dexscreener|solscan/i.test(text);

    if (!hasCa && !hasPumpLink && !match) continue;

    console.log(
      `${new Date(snowflakeMs(msg.id)).toLocaleString("hu-HU")}  @${user}${isJohn ? " [JOHN]" : ""}`,
    );
    console.log(`  raw: ${JSON.stringify(text.slice(0, 300))}`);
    console.log(`  embeds=${msg.embeds?.length ?? 0} match=${match ?? "no"}`);
    if (msg.embeds?.length) {
      for (const e of msg.embeds) {
        const blob = [e.title, e.description, e.url].filter(Boolean).join(" ");
        if (blob) console.log(`  embed: ${blob.slice(0, 200)}`);
      }
    }
    console.log();
  }
}

main();
