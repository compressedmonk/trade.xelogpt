import type { RawDiscordMessage } from "../types.js";

export function messageText(msg: RawDiscordMessage): string {
  // applyUnlocked() already merges unlocked.* into the top-level content/embed
  // fields, so reading unlocked.* here would duplicate the limit lines. We dedupe
  // defensively in case a caller passes an un-merged message.
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const part of [msg.content, msg.embedTitle, msg.embedDescription]) {
    const value = part?.trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      parts.push(value);
    }
  }
  return parts.join("\n");
}
