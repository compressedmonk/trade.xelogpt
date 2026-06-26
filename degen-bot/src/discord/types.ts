export interface DiscordAuthor {
  id?: string;
  username?: string;
  global_name?: string;
  bot?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
}

export interface DiscordAttachment {
  id?: string;
  filename?: string;
}

export interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  content?: string;
  author?: DiscordAuthor;
  embeds?: DiscordEmbed[];
  attachments?: DiscordAttachment[];
}

/** Discord Gateway payload envelope (op 0 dispatch carries t/s/d). */
export interface GatewayPayload {
  op: number;
  t?: string | null;
  s?: number | null;
  d?: unknown;
}
