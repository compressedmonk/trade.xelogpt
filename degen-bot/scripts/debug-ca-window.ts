/** Find messages around a date containing pump/solscan/CA patterns. */
import { config } from "../src/config.js";
import { resolveUserToken } from "../src/discord/token.js";
import { extractDegenCa } from "../src/discord/ca-filter.js";
import type { DiscordMessage } from "../src/discord/types.js";

function snowflakeMs(id: string): number {
  return Number((BigInt(id) >> 22n) + 1420070400000n);
}

function fmtLocal(ms: number): string {
  return new Date(ms).toLocaleString("hu-HU");
}

async function main(): Promise<void> {
  const token = resolveUserToken();
  const channelId = config.channelId;
  const ctx = { channelId, watchUserIds: config.watchUserIds };
  // May 20–22 2026 local window (wide)
  const start = Date.parse("2026-05-20T00:00:00");
  const end = Date.parse("2026-05-22T23:59:59");

  let before: string | undefined;
  const hits: DiscordMessage[] = [];

  for (let page = 0; page < 100; page++) {
    const url = new URL(`https://discord.com/api/v9/channels/${channelId}/messages`);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);
    const res = await fetch(url, { headers: { Authorization: token } });
    const batch = (await res.json()) as DiscordMessage[];
    if (!batch.length) break;

    for (const msg of batch) {
      const ts = snowflakeMs(msg.id);
      if (ts < start) continue;
      if (ts > end) continue;
      const text = (msg.content ?? "").toLowerCase();
      if (
        text.includes("pump") ||
        text.includes("solscan") ||
        /[1-9a-hj-np-z]{32,44}/i.test(msg.content ?? "") ||
        extractDegenCa(msg, ctx)
      ) {
        hits.push(msg);
      }
    }

    const oldest = snowflakeMs(batch[batch.length - 1].id);
    before = batch[batch.length - 1].id;
    if (oldest < start) break;
  }

  console.log(`CA-ish messages May 20–22: ${hits.length}\n`);
  for (const msg of hits.sort((a, b) => snowflakeMs(a.id) - snowflakeMs(b.id))) {
    const mint = extractDegenCa(msg, ctx);
    console.log(`${fmtLocal(snowflakeMs(msg.id))}  @${msg.author?.username} (${msg.author?.id})`);
    console.log(`  ${JSON.stringify((msg.content ?? "").slice(0, 250))}`);
    console.log(`  embeds=${msg.embeds?.length ?? 0} filter=${mint ? "MATCH " + mint : "no"}`);
    console.log();
  }
}

main();
