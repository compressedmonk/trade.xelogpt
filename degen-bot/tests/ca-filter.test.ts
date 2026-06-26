import { extractDegenCa, isDegenTrigger } from "../src/discord/ca-filter.js";
import type { DiscordMessage } from "../src/discord/types.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const ctx = {
  channelId: "chan-1",
  watchUserIds: new Set(["user-1", "user-2"]),
};

const VALID_CA = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function msg(over: Partial<DiscordMessage>): DiscordMessage {
  return {
    id: "100",
    channel_id: "chan-1",
    author: { id: "user-1" },
    content: VALID_CA,
    ...over,
  };
}

// Happy path: watched user posts only a CA in the target channel.
assert(extractDegenCa(msg({}), ctx) === VALID_CA, "valid CA-only post matches");
assert(isDegenTrigger(msg({}), ctx), "isDegenTrigger true for clean post");

// Wrong channel.
assert(extractDegenCa(msg({ channel_id: "other" }), ctx) === null, "wrong channel rejected");

// Unwatched author.
assert(extractDegenCa(msg({ author: { id: "stranger" } }), ctx) === null, "stranger rejected");

// Extra text alongside the CA.
assert(extractDegenCa(msg({ content: `buy this ${VALID_CA}` }), ctx) === null, "extra text rejected");
assert(extractDegenCa(msg({ content: `${VALID_CA} now` }), ctx) === null, "trailing text rejected");

// Whitespace around a clean CA is tolerated.
assert(extractDegenCa(msg({ content: `  ${VALID_CA}\n` }), ctx) === VALID_CA, "whitespace trimmed");

// Embeds or attachments disqualify.
assert(extractDegenCa(msg({ embeds: [{ title: "x" }] }), ctx) === null, "embed rejected");
assert(extractDegenCa(msg({ attachments: [{ id: "a" }] }), ctx) === null, "attachment rejected");

// Wrapped SOL mint is never a buy target.
assert(
  extractDegenCa(msg({ content: "So11111111111111111111111111111111111111112" }), ctx) === null,
  "wrapped SOL rejected",
);

// Non-address text.
assert(extractDegenCa(msg({ content: "gm" }), ctx) === null, "non-address rejected");

// EVM 0x address is not a Solana CA (v1 ignores it).
assert(
  extractDegenCa(msg({ content: "0x1234567890abcdef1234567890abcdef12345678" }), ctx) === null,
  "evm address rejected",
);

// Real #degeneral post format (May 2024 RKC) — CA-only line from cryptogodjohn.
const rkcCa = "7HgfXftRBBqsYtAEYcqjGLQrNJLL6Tww9ek4rE3Apump";
assert(extractDegenCa(msg({ content: rkcCa }), ctx) === rkcCa, "historical RKC CA-only post matches");

console.log("All ca-filter tests passed.");
