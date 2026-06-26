import { isAlertsChannelName, isTradesChannelName, tradesChannelScore } from "./navigate.js";

export interface GuildChannel {
  id: string;
  name: string;
  type: number;
  guild_id?: string;
}

export function parseGuildChannels(body: unknown): GuildChannel[] {
  if (!Array.isArray(body)) return [];
  return body as GuildChannel[];
}

export function findTradesChannel(channels: GuildChannel[]): GuildChannel | null {
  let best: GuildChannel | null = null;
  let bestScore = -1;
  for (const ch of channels) {
    if (ch.type !== 0 && ch.type !== 5) continue;
    const score = tradesChannelScore(ch.name);
    if (score > bestScore) {
      bestScore = score;
      best = ch;
    }
  }
  return bestScore >= 0 ? best : null;
}

export function findAlertsChannel(channels: GuildChannel[]): GuildChannel | null {
  for (const ch of channels) {
    if (ch.type !== 0 && ch.type !== 5) continue;
    if (isAlertsChannelName(ch.name)) return ch;
  }
  return null;
}

export function channelIdFromDiscordUrl(url: string): { guildId: string; channelId: string } | null {
  const m = url.match(/discord\.com\/channels\/(\d+)\/(\d+)/);
  if (!m) return null;
  return { guildId: m[1], channelId: m[2] };
}
