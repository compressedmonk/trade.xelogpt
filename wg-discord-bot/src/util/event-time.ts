import { messageTimestampMs } from "./snowflake.js";

export function postedAtFromMsgId(msgId: string | undefined | null): string | null {
  if (!msgId?.trim()) return null;
  try {
    return new Date(messageTimestampMs(msgId)).toISOString();
  } catch {
    return null;
  }
}

export function msgTiming(discordMsgId?: string | null): {
  discordMsgId: string | null;
  postedAt: string | null;
} {
  const id = discordMsgId?.trim() || null;
  return { discordMsgId: id, postedAt: postedAtFromMsgId(id) };
}

/** Extract message snowflake from WG alert link in raw text (legacy events). */
export function msgIdFromDiscordLink(text: string): string | null {
  const m = text.match(/\/channels\/\d+\/\d+\/(\d{17,20})/);
  return m ? m[1] : null;
}

export function postedAtFromRawText(rawText: string): string | null {
  return postedAtFromMsgId(msgIdFromDiscordLink(rawText));
}
