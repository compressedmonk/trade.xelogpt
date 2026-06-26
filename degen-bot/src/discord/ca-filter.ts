import type { DiscordMessage } from "./types.js";

/** Base58, 32-44 chars — standard Solana address shape. */
const SOL_CA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** Wrapped SOL — never a buy target. */
const SOL_MINT = "So11111111111111111111111111111111111111112";

export interface DegenMatchContext {
  channelId: string;
  watchUserIds: Set<string>;
}

/**
 * Returns the Solana mint if the message is a clean "contract address only"
 * post from a watched user in the target channel, otherwise null. Anything with
 * extra text, embeds, or attachments is rejected to avoid false triggers.
 */
export function extractDegenCa(
  msg: DiscordMessage,
  ctx: DegenMatchContext,
): string | null {
  if (msg.channel_id !== ctx.channelId) return null;
  if (!msg.author?.id || !ctx.watchUserIds.has(msg.author.id)) return null;
  if (msg.embeds?.length || msg.attachments?.length) return null;

  const text = (msg.content ?? "").trim();
  if (!SOL_CA_RE.test(text)) return null;
  if (text === SOL_MINT) return null;

  return text;
}

export function isDegenTrigger(msg: DiscordMessage, ctx: DegenMatchContext): boolean {
  return extractDegenCa(msg, ctx) !== null;
}
