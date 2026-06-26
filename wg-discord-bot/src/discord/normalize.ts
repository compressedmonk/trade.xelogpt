import type { DiscordComponent, DiscordGatewayMessage, RawDiscordMessage } from "../types.js";

const UNLOCK_LABEL_RE = /unlock/i;
const UNLOCK_CONTENT_RE = /press the button to unlock|unlock the content|unlock content/i;

export function flattenComponents(components?: DiscordComponent[]): DiscordComponent[] {
  if (!components?.length) return [];
  const flat: DiscordComponent[] = [];
  for (const row of components) {
    if (row.type === 2) {
      flat.push(row);
    }
    if (row.components?.length) {
      flat.push(...flattenComponents(row.components));
    }
  }
  return flat;
}

export function hasUnlockButton(components?: DiscordComponent[]): boolean {
  return flattenComponents(components).some((c) => UNLOCK_LABEL_RE.test(c.label ?? ""));
}

export function isUnlockTeaser(msg: Pick<RawDiscordMessage, "content" | "components">): boolean {
  if (hasUnlockButton(msg.components)) return true;
  return UNLOCK_CONTENT_RE.test(msg.content);
}

export function isDirectLimitSignal(
  msg: Pick<RawDiscordMessage, "content" | "components" | "embedTitle" | "embedDescription">,
): boolean {
  if (isUnlockTeaser(msg)) return false;
  const text = [msg.content, msg.embedTitle, msg.embedDescription].filter(Boolean).join("\n");
  if (/press the button to unlock/i.test(text)) return false;
  if (!/valid limit order/i.test(text)) return false;
  return (
    /LIMIT\s+\w+\s*\|.*Entry:.*SL:/i.test(text) ||
    /\b\w+\s+limit\s+[\d.,]+\s+[\d.,]+\s+stop\s+[\d.,]+/i.test(text) ||
    /\b\w+\s+limit\s+(?:long|short)\s+[\d.,]+/i.test(text)
  );
}

export function normalizeGatewayMessage(
  msg: DiscordGatewayMessage,
  source: RawDiscordMessage["source"] = "gateway",
): RawDiscordMessage | null {
  if (!msg.id || !msg.channel_id) return null;

  const author = msg.author;
  const embed = msg.embeds?.[0];
  const components = msg.components;

  const raw: RawDiscordMessage = {
    id: msg.id,
    channelId: msg.channel_id,
    content: msg.content ?? "",
    authorName: author?.global_name ?? author?.username ?? "unknown",
    authorId: author?.id ?? "",
    embedTitle: embed?.title,
    embedDescription: embed?.description,
    components,
    applicationId: msg.application_id,
    capturedAt: new Date().toISOString(),
    source,
  };

  raw.requiresUnlock = isUnlockTeaser(raw);
  return raw;
}

export function applyUnlocked(
  msg: RawDiscordMessage,
  unlocked: NonNullable<RawDiscordMessage["unlocked"]>,
): RawDiscordMessage {
  return {
    ...msg,
    requiresUnlock: false,
    unlocked,
    content: unlocked.content || msg.content,
    embedTitle: unlocked.embedTitle ?? msg.embedTitle,
    embedDescription: unlocked.embedDescription ?? msg.embedDescription,
  };
}

export function isWgBotMessage(
  msg: RawDiscordMessage,
  wgBotName: string,
  wgBotAuthorId?: string,
): boolean {
  if (wgBotAuthorId && msg.authorId === wgBotAuthorId) return true;
  const name = msg.authorName.toLowerCase();
  const expected = wgBotName.toLowerCase();
  return name === expected || name.includes("wg bot") || name === "wg trades";
}

export function isWatchedChannel(msg: RawDiscordMessage, channelIds: string[]): boolean {
  return channelIds.includes(msg.channelId);
}

export function extractTraderMention(content: string): string | null {
  const all = [...content.matchAll(/@([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
  if (all.length === 0) return null;
  if (/@\w[\w-]*\s*$/.test(content.trim())) return all[all.length - 1];
  return all[0];
}
