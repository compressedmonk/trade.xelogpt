/**
 * Scan #degeneral backwards from now until a calendar date (Budapest midnight).
 * Lists watched-user CA-only triggers + CA-in-text near-misses.
 *
 * Usage: npx tsx scripts/scan-since.ts 2026-05-01
 */
import { config } from "../src/config.js";
import { resolveUserToken } from "../src/discord/token.js";
import { extractDegenCa } from "../src/discord/ca-filter.js";
import type { DiscordMessage } from "../src/discord/types.js";

const SOL_CA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function snowflakeMs(id: string): number {
  return Number((BigInt(id) >> 22n) + 1420070400000n);
}

function snowflakeFromMs(ts: number): string {
  return String((BigInt(Math.floor(ts - 1420070400000)) << 22n) + 1n);
}

/** Budapest midnight on isoDate → UTC ms (CEST = UTC+2). */
function budapestMidnightUtcMs(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d - 1, 22, 0, 0);
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
  const sinceDate = process.argv[2] ?? "2026-05-01";
  const cutoffMs = budapestMidnightUtcMs(sinceDate);
  const token = resolveUserToken();
  const ctx = {
    channelId: config.channelId,
    watchUserIds: config.watchUserIds,
  };

  console.log(`Channel: ${ctx.channelId}`);
  console.log(`Watch: ${[...ctx.watchUserIds].join(", ")}`);
  console.log(`Since: ${sinceDate} 00:00 Budapest (${fmt(cutoffMs)} UTC-ish)\n`);

  const matches: Array<{ msg: DiscordMessage; mint: string }> = [];
  const nearMisses: Array<{ msg: DiscordMessage; reason: string }> = [];
  let scanned = 0;
  let before: string | undefined;

  for (let page = 0; page < 300; page++) {
    const url = new URL(`https://discord.com/api/v9/channels/${ctx.channelId}/messages`);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);

    const res = await fetch(url, { headers: { Authorization: token } });
    if (!res.ok) throw new Error(`Discord API ${res.status}: ${await res.text()}`);

    const batch = (await res.json()) as DiscordMessage[];
    if (!batch.length) break;

    const oldestTs = snowflakeMs(batch[batch.length - 1].id);

    for (const msg of batch) {
      const ts = snowflakeMs(msg.id);
      if (ts < cutoffMs) continue;
      scanned++;

      if (!msg.author?.id || !ctx.watchUserIds.has(msg.author.id)) continue;

      const mint = extractDegenCa(msg, ctx);
      if (mint) {
        matches.push({ msg, mint });
        continue;
      }

      const text = (msg.content ?? "").trim();
      if (!text) continue;

      const hasCaShape = SOL_CA_RE.test(text) || /[1-9A-HJ-NP-Za-km-z]{32,44}/.test(text);
      const hasLink = /pump\.fun|solscan|dexscreener/i.test(text);

      if (hasCaShape || hasLink) {
        let reason = "not CA-only";
        if (msg.embeds?.length) reason = "has embed";
        else if (msg.attachments?.length) reason = "has attachment";
        else if (hasLink && !SOL_CA_RE.test(text)) reason = "link not raw CA";
        else if (!SOL_CA_RE.test(text)) reason = `extra text: ${text.slice(0, 80)}`;
        nearMisses.push({ msg, reason });
      }
    }

    before = batch[batch.length - 1].id;
    if (oldestTs < cutoffMs) {
      console.log(`(stopped at page ${page + 1}, oldest=${fmt(oldestTs)})\n`);
      break;
    }
    if (batch.length < 100) break;
  }

  console.log(`Scanned ${scanned} messages since ${sinceDate}.\n`);

  console.log(`=== CA-ONLY TRIGGERS (${matches.length}) ===`);
  if (!matches.length) {
    console.log("(none)");
  } else {
    for (const { msg, mint } of matches.sort((a, b) => snowflakeMs(a.msg.id) - snowflakeMs(b.msg.id))) {
      console.log(`${fmt(snowflakeMs(msg.id))}  @${msg.author?.username}  ${mint}`);
    }
  }

  console.log(`\n=== NEAR-MISSES — link/CA in text, rejected (${nearMisses.length}) ===`);
  if (!nearMisses.length) {
    console.log("(none)");
  } else {
    for (const { msg, reason } of nearMisses.sort((a, b) => snowflakeMs(a.msg.id) - snowflakeMs(b.msg.id))) {
      const preview = (msg.content ?? "").replace(/\s+/g, " ").slice(0, 120);
      console.log(`${fmt(snowflakeMs(msg.id))}  [${reason}]`);
      console.log(`  ${preview}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
