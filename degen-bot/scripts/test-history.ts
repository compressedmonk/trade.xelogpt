/**
 * Replay #degeneral history through the CA filter — no live post needed.
 * Shows past triggers, near-misses (almost matched), and why posts were rejected.
 */
import { config } from "../src/config.js";
import { resolveUserToken } from "../src/discord/token.js";
import { extractDegenCa } from "../src/discord/ca-filter.js";
import type { DiscordMessage } from "../src/discord/types.js";

const SOL_CA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function fetchAllMessages(
  token: string,
  channelId: string,
  maxPages = 10,
): Promise<DiscordMessage[]> {
  const all: DiscordMessage[] = [];
  let before: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`https://discord.com/api/v9/channels/${channelId}/messages`);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);

    const res = await fetch(url, { headers: { Authorization: token } });
    if (!res.ok) throw new Error(`Discord API ${res.status}: ${await res.text()}`);

    const batch = (await res.json()) as DiscordMessage[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    before = batch[batch.length - 1].id;
    if (batch.length < 100) break;
  }
  return all;
}

function snowflakeToDate(id: string): string {
  const ms = Number((BigInt(id) >> 22n) + 1420070400000n);
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

function rejectReason(msg: DiscordMessage, ctx: { channelId: string; watchUserIds: Set<string> }): string {
  if (msg.channel_id !== ctx.channelId) return "wrong channel";
  if (!msg.author?.id || !ctx.watchUserIds.has(msg.author.id)) return "not watched user";
  if (msg.embeds?.length) return "has embed";
  if (msg.attachments?.length) return "has attachment";
  const text = (msg.content ?? "").trim();
  if (!text) return "empty";
  if (!SOL_CA_RE.test(text)) return `not CA-only: "${text.slice(0, 60)}${text.length > 60 ? "…" : ""}"`;
  return "unknown";
}

async function main(): Promise<void> {
  if (!config.channelId) throw new Error("DEGEN_CHANNEL_ID required");
  const token = resolveUserToken();
  const ctx = { channelId: config.channelId, watchUserIds: config.watchUserIds };

  console.log(`Fetching history: channel=${config.channelId}`);
  console.log(`Watch users: ${[...ctx.watchUserIds].join(", ") || "(none)"}\n`);

  const messages = await fetchAllMessages(token, config.channelId, 15);
  console.log(`Loaded ${messages.length} messages\n`);

  const matches: Array<{ msg: DiscordMessage; mint: string }> = [];
  const nearMisses: Array<{ msg: DiscordMessage; reason: string }> = [];

  for (const msg of messages) {
    const mint = extractDegenCa(msg, ctx);
    if (mint) {
      matches.push({ msg, mint });
      continue;
    }
    // Near-miss: watched user, looks address-like or short post
    const authorId = msg.author?.id ?? "";
    if (!ctx.watchUserIds.has(authorId)) continue;
    const text = (msg.content ?? "").trim();
    if (!text) continue;
    const hasCaShape = SOL_CA_RE.test(text) || /[1-9A-HJ-NP-Za-km-z]{20,}/.test(text);
    if (hasCaShape || (text.length < 50 && !/^(gm|gn|lol|ok)$/i.test(text))) {
      nearMisses.push({ msg, reason: rejectReason(msg, ctx) });
    }
  }

  console.log("=== WOULD TRIGGER (MATCH) ===");
  if (matches.length === 0) {
    console.log("(none in fetched history)");
  } else {
    for (const { msg, mint } of matches) {
      const user = msg.author?.username ?? msg.author?.id;
      console.log(`${snowflakeToDate(msg.id)}  @${user}  mint=${mint}`);
    }
  }

  console.log("\n=== NEAR-MISSES (watched user, rejected) ===");
  if (nearMisses.length === 0) {
    console.log("(none)");
  } else {
    for (const { msg, reason } of nearMisses.slice(0, 25)) {
      const user = msg.author?.username ?? msg.author?.id;
      const preview = (msg.content ?? "").replace(/\s+/g, " ").slice(0, 70);
      console.log(`${snowflakeToDate(msg.id)}  @${user}  [${reason}]  "${preview}"`);
    }
    if (nearMisses.length > 25) console.log(`… +${nearMisses.length - 25} more`);
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Matches: ${matches.length}`);
  console.log(`Near-misses from watched user: ${nearMisses.length}`);
  if (matches.length > 0) {
    console.log("\nOK — filter would have caught these historical CA posts.");
  } else if (nearMisses.length > 0) {
    console.log("\nWARN — watched user posted address-like content but filter rejected it.");
    console.log("Check near-miss reasons above (extra text, embed, link, etc.).");
  } else {
    console.log("\nNo CA posts from watched user in this history window.");
    console.log("Run a live self-test (see README) or fetch more pages.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
