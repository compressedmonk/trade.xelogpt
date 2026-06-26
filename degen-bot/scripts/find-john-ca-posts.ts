import { config } from "../src/config.js";
import { resolveUserToken } from "../src/discord/token.js";
import { extractDegenCa } from "../src/discord/ca-filter.js";
import type { DiscordMessage } from "../src/discord/types.js";

function snowflakeMs(id: string): number {
  return Number((BigInt(id) >> 22n) + 1420070400000n);
}

async function main(): Promise<void> {
  const token = resolveUserToken();
  const ctx = { channelId: config.channelId, watchUserIds: config.watchUserIds };
  let before: string | undefined;

  for (let page = 0; page < 200; page++) {
    const url = new URL(`https://discord.com/api/v9/channels/${ctx.channelId}/messages`);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);
    const res = await fetch(url, { headers: { Authorization: token } });
    const batch = (await res.json()) as DiscordMessage[];
    if (!batch.length) break;

    for (const msg of batch) {
      if (msg.author?.id !== "242333226964746240") continue;
      const text = msg.content ?? "";
      if (!/solscan|pump\.fun|Apump/i.test(text) && !extractDegenCa(msg, ctx)) continue;

      console.log("id:", msg.id);
      console.log("utc:", new Date(snowflakeMs(msg.id)).toISOString());
      console.log("local:", new Date(snowflakeMs(msg.id)).toLocaleString("hu-HU"));
      console.log("content:", JSON.stringify(text));
      console.log("embeds:", msg.embeds?.length, "attachments:", msg.attachments?.length);
      console.log("match:", extractDegenCa(msg, ctx));
      console.log("---");
    }
    before = batch[batch.length - 1].id;
  }
}

main();
