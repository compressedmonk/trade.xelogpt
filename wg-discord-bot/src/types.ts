export interface DiscordComponent {
  type: number;
  custom_id?: string;
  label?: string;
  style?: number;
  components?: DiscordComponent[];
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
}

export interface UnlockedContent {
  content?: string;
  embedTitle?: string;
  embedDescription?: string;
  source: "interaction" | "dom" | "message_update";
}

export interface RawDiscordMessage {
  id: string;
  channelId: string;
  content: string;
  authorName: string;
  authorId: string;
  embedTitle?: string;
  embedDescription?: string;
  components?: DiscordComponent[];
  applicationId?: string;
  requiresUnlock?: boolean;
  unlocked?: UnlockedContent;
  capturedAt: string;
  source: "gateway" | "rest" | "dom";
}

export interface DiscordGatewayMessage {
  id: string;
  channel_id: string;
  content?: string;
  author?: {
    id?: string;
    username?: string;
    global_name?: string;
    bot?: boolean;
  };
  embeds?: DiscordEmbed[];
  components?: DiscordComponent[];
  application_id?: string;
  interaction?: {
    id?: string;
    name?: string;
  };
}

export type GatewayEventType = "MESSAGE_CREATE" | "MESSAGE_UPDATE";

export interface GatewayEvent {
  type: GatewayEventType;
  message: DiscordGatewayMessage;
}

export interface UnlockResult {
  messageId: string;
  success: boolean;
  source?: UnlockedContent["source"];
  content?: string;
  embedTitle?: string;
  embedDescription?: string;
  error?: string;
}
