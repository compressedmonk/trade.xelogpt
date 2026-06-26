import type { DiscordGatewayMessage, GatewayEvent, GatewayEventType } from "../types.js";

interface GatewayPayload {
  t?: string;
  op?: number;
  d?: unknown;
}

const MESSAGE_EVENTS: GatewayEventType[] = ["MESSAGE_CREATE", "MESSAGE_UPDATE"];

function asMessageEvent(type: string, d: unknown): GatewayEvent | null {
  if (!MESSAGE_EVENTS.includes(type as GatewayEventType)) return null;
  if (!d || typeof d !== "object") return null;
  return { type: type as GatewayEventType, message: d as DiscordGatewayMessage };
}

export function parseGatewayEvent(payload: string): GatewayEvent | null {
  try {
    const data = JSON.parse(payload) as GatewayPayload;
    if (data.t && data.d) {
      return asMessageEvent(data.t, data.d);
    }
    if (data.op === 0 && data.t && data.d) {
      return asMessageEvent(data.t, data.d);
    }
  } catch {
    // zlib/binary or non-json frames — ignore
  }
  return null;
}

/** @deprecated use parseGatewayEvent */
export function parseGatewayFrame(payload: string): DiscordGatewayMessage | null {
  const event = parseGatewayEvent(payload);
  return event?.type === "MESSAGE_CREATE" ? event.message : null;
}

export function parseRestMessages(body: unknown): DiscordGatewayMessage[] {
  if (!Array.isArray(body)) return [];
  return body as DiscordGatewayMessage[];
}
