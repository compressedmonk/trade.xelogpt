/**
 * Dump ALL posts from watched user(s) on a calendar day (Europe/Budapest).
 * Usage: npx tsx scripts/dump-day.ts 2026-05-21
 */
import { config } from "../src/config.js";
import { resolveUserToken } from "../src/discord/token.js";
import { extractDegenCa } from "../src/discord/ca-filter.js";
import type { DiscordMessage } from "../src/discord/types.js";

function snowflakeMs(id: string): number {
  return Number((BigInt(id) >> 22n) + 1420070400000n);
}

function snowflakeFromMs(ts: number): string {
  return String((BigInt(Math.floor(ts - 1420070400000)) << 22n) + 1n);
}

/** Budapest calendar day → UTC ms range (CEST, UTC+2 in May). */
function budapestDayRange(isoDate: string): { start: number; end: number } {
  const [y, m, d] = isoDate.split("-").map(Number);
  // Midnight Budapest = previous day 22:00 UTC (CEST)
  const start = Date.UTC(y, m - 1, d - 1, 22, 0, 0);
  const end = Date.UTC(y, m - 1, d, 21, 59, 59, 999);
  return { start, end };
}

async function fetchDayMessages(
  token: string,
  channelId: string,
  startMs: number,
  endMs: number,
): Promise<DiscordMessage[]> {
  const afterId = snowflakeFromMs(startMs - 1);
  const all: DiscordMessage[] = [];
  let before: string | undefined;

  for (let page = 0; page < 50; page++) {
    const url = new URL(`https://discord.com/api/v9/channels/${channelId}/messages`);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);
    else url.searchParams.set("after", afterId);

    const res = await fetch(url, { headers: { Authorization: token } });
    if (!res.ok) throw new Error(`Discord API ${res.status}: ${await res.text()}`);
    const batch = (await res.json()) as DiscordMessage[];
    if (!batch.length) break;

    for (const msg of batch) {
      const ts = snowflakeMs(msg.id);
      if (ts >= startMs && ts <= endMs) all.push(msg);
    }

    const oldest = snowflakeMs(batch[batch.length - 1].id);
    before = batch[batch.length - 1].id;
    if (oldest < startMs) break;
  }
  return all;
}

async function main(): Promise<void> {
  const day = process.argv[2] ?? "2026-05-21";
  const { start, end } = budapestDayRange(day);
  const token = resolveUserToken();
  const ctx = { channelId: config.channelId, watchUserIds: config.watchUserIds };

  const all = await fetchDayMessages(token, ctx.channelId, start, end);
  const john = all.filter((m) => m.author?.id && ctx.watchUserIds.has(m.author.id));

  console.log(`Day ${day} (Budapest): ${john.length} posts from watched user(s)\n`);

  for (const msg of john.sort((a, b) => snowflakeMs(a.id) - snowflakeMs(b.id))) {
    const t = new Date(snowflakeMs(msg.id)).toLocaleString("hu-HU");
    const content = msg.content ?? "";
    const mint = extractDegenCa(msg, ctx);
    console.log(`[${t}] @${msg.author?.username}`);
    console.log(`  content: ${JSON.stringify(content)}`);
    console.log(`  len=${content.length} embeds=${msg.embeds?.length ?? 0} attachments=${msg.attachments?.length ?? 0}`);
    console.log(`  filter: ${mint ? `MATCH ${mint}` : "no match"}`);
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
