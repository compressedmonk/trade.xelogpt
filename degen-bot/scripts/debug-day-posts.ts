/** Debug: dump all cryptogodjohn posts on a given date (YYYY-MM-DD). */
import { config } from "../src/config.js";
import { resolveUserToken } from "../src/discord/token.js";
import { extractDegenCa } from "../src/discord/ca-filter.js";
import type { DiscordMessage } from "../src/discord/types.js";

const WATCH_ID = "242333226964746240";

function snowflakeMs(id: string): number {
  return Number((BigInt(id) >> 22n) + 1420070400000n);
}

async function main(): Promise<void> {
  const dateArg = process.argv[2] ?? "2026-05-21";
  const [y, m, d] = dateArg.split("-").map(Number);
  const dayStart = Date.UTC(y, m - 1, d, 0, 0, 0);
  const dayEnd = Date.UTC(y, m - 1, d, 23, 59, 59, 999);

  const token = resolveUserToken();
  const ctx = { channelId: config.channelId, watchUserIds: new Set([WATCH_ID]) };
  let before: string | undefined;
  const hits: DiscordMessage[] = [];

  for (let page = 0; page < 100; page++) {
    const url = new URL(`https://discord.com/api/v9/channels/${ctx.channelId}/messages`);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);

    const res = await fetch(url, { headers: { Authorization: token } });
    const batch = (await res.json()) as DiscordMessage[];
    if (!batch.length) break;

    for (const msg of batch) {
      if (msg.author?.id !== WATCH_ID) continue;
      const ts = snowflakeMs(msg.id);
      if (ts >= dayStart && ts <= dayEnd) hits.push(msg);
    }

    const oldest = snowflakeMs(batch[batch.length - 1].id);
    before = batch[batch.length - 1].id;
    if (oldest < dayStart) break;
    if (batch.length < 100) break;
  }

  console.log(`@${dateArg} posts from cryptogodjohn: ${hits.length}\n`);
  for (const msg of hits.sort((a, b) => snowflakeMs(a.id) - snowflakeMs(b.id))) {
    const t = new Date(snowflakeMs(msg.id)).toISOString().slice(11, 19);
    const mint = extractDegenCa(msg, ctx);
    const content = msg.content ?? "";
    const embeds = msg.embeds?.length ?? 0;
    const attachments = msg.attachments?.length ?? 0;
    console.log(`--- ${t} ---`);
    console.log(`content (${content.length} chars): ${JSON.stringify(content)}`);
    console.log(`embeds=${embeds} attachments=${attachments}`);
    console.log(`filter: ${mint ? `MATCH ${mint}` : "no match"}`);
    if (embeds && msg.embeds) {
      for (const e of msg.embeds) {
        console.log(`  embed title: ${e.title ?? ""}`);
        console.log(`  embed desc: ${(e.description ?? "").slice(0, 120)}`);
      }
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
