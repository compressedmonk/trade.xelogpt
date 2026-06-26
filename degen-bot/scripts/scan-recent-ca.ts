/**
 * Scan #degeneral for watched-user CA-only posts in the last N days.
 * Usage: npx tsx scripts/scan-recent-ca.ts [days=60]
 */
import { config } from "../src/config.js";
import { resolveUserToken } from "../src/discord/token.js";
import { extractDegenCa } from "../src/discord/ca-filter.js";
import type { DiscordMessage } from "../src/discord/types.js";

const SOL_CA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function snowflakeMs(id: string): number {
  return Number((BigInt(id) >> 22n) + 1420070400000n);
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function main(): Promise<void> {
  const days = Number(process.argv[2] ?? "60");
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const token = resolveUserToken();
  const ctx = {
    channelId: config.channelId,
    watchUserIds: config.watchUserIds,
  };

  console.log(`Channel: ${ctx.channelId}`);
  console.log(`Watch users: ${[...ctx.watchUserIds].join(", ")}`);
  console.log(`Window: last ${days} days (since ${fmt(cutoff)})\n`);

  const matches: Array<{ msg: DiscordMessage; mint: string }> = [];
  const caInText: Array<{ msg: DiscordMessage; text: string }> = [];
  let scanned = 0;
  let before: string | undefined;

  for (let page = 0; page < 200; page++) {
    const url = new URL(`https://discord.com/api/v9/channels/${ctx.channelId}/messages`);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);

    const res = await fetch(url, { headers: { Authorization: token } });
    if (!res.ok) throw new Error(`Discord API ${res.status}: ${await res.text()}`);

    const batch = (await res.json()) as DiscordMessage[];
    if (!batch.length) break;

    let pastCutoff = false;
    for (const msg of batch) {
      const ts = snowflakeMs(msg.id);
      if (ts < cutoff) {
        pastCutoff = true;
        continue;
      }
      scanned++;
      if (!msg.author?.id || !ctx.watchUserIds.has(msg.author.id)) continue;

      const mint = extractDegenCa(msg, ctx);
      if (mint) {
        matches.push({ msg, mint });
        continue;
      }

      const text = (msg.content ?? "").trim();
      const embedded = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
      if (embedded && !SOL_CA_RE.test(text)) {
        caInText.push({ msg, text });
      }
    }

    before = batch[batch.length - 1].id;
    if (pastCutoff || batch.length < 100) break;
  }

  console.log(`Scanned ${scanned} messages in window.\n`);

  console.log(`=== CA-ONLY TRIGGERS (${matches.length}) ===`);
  if (matches.length === 0) {
    console.log("(none)");
  } else {
    for (const { msg, mint } of matches) {
      console.log(`${fmt(snowflakeMs(msg.id))}  @${msg.author?.username}  ${mint}`);
    }
  }

  console.log(`\n=== CA IN TEXT BUT REJECTED (${caInText.length}) ===`);
  if (caInText.length === 0) {
    console.log("(none)");
  } else {
    for (const { msg, text } of caInText) {
      const preview = text.replace(/\s+/g, " ").slice(0, 90);
      console.log(`${fmt(snowflakeMs(msg.id))}  "${preview}"`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
