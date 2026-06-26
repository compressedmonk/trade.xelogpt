import WebSocket from "ws";
import { log } from "../util/logger.js";
import { ZlibStream } from "./zlib-stream.js";
import type { DiscordMessage, GatewayPayload } from "./types.js";

const DEFAULT_GATEWAY = "wss://gateway.discord.gg";
const GATEWAY_PARAMS = "?v=9&encoding=json&compress=zlib-stream";

enum Op {
  Dispatch = 0,
  Heartbeat = 1,
  Identify = 2,
  Resume = 6,
  Reconnect = 7,
  InvalidSession = 9,
  Hello = 10,
  HeartbeatAck = 11,
}

export interface GatewayHandlers {
  onMessageCreate: (msg: DiscordMessage) => void;
  onReady?: () => void;
}

/**
 * Minimal Discord gateway client for a user session token. Handles the
 * hello/identify/heartbeat lifecycle, RESUME after brief drops, and reconnects
 * with backoff. Only MESSAGE_CREATE dispatches are surfaced.
 */
export class DiscordGateway {
  private ws: WebSocket | null = null;
  private zlib: ZlibStream | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatIntervalMs = 0;
  private lastSeq: number | null = null;
  private sessionId: string | null = null;
  private resumeUrl: string | null = null;
  private acked = true;
  private closed = false;
  private reconnectDelayMs = 1_000;

  constructor(
    private readonly token: string,
    private readonly handlers: GatewayHandlers,
  ) {}

  start(): void {
    this.closed = false;
    this.connect();
  }

  stop(): void {
    this.closed = true;
    this.clearHeartbeat();
    this.zlib?.destroy();
    this.zlib = null;
    this.ws?.removeAllListeners();
    this.ws?.close(1000);
    this.ws = null;
  }

  private connect(): void {
    const base = this.resumeUrl ?? DEFAULT_GATEWAY;
    const url = `${base.replace(/\/$/, "")}/${GATEWAY_PARAMS}`;
    this.zlib = new ZlibStream((payload) => this.handlePayload(payload as GatewayPayload));
    this.ws = new WebSocket(url);

    this.ws.on("message", (data: Buffer) => this.zlib?.push(data));
    this.ws.on("open", () => log.gw("websocket open"));
    this.ws.on("error", (err) => log.warn("gw", `websocket error: ${err.message}`));
    this.ws.on("close", (code) => this.handleClose(code));
  }

  private handleClose(code: number): void {
    this.clearHeartbeat();
    this.zlib?.destroy();
    this.zlib = null;
    if (this.closed) return;

    // 4004 = auth failed, 4010-4014 = unrecoverable identify problems
    const fatal = code === 4004 || (code >= 4010 && code <= 4014);
    if (fatal) {
      this.sessionId = null;
      this.resumeUrl = null;
      log.error("gw", `fatal close ${code} — token/identify invalid, full reconnect`);
    } else {
      log.warn("gw", `closed ${code} — reconnecting in ${this.reconnectDelayMs}ms`);
    }

    setTimeout(() => this.connect(), this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 30_000);
  }

  private send(op: Op, d: unknown): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ op, d }));
  }

  private handlePayload(payload: GatewayPayload): void {
    if (typeof payload.s === "number") this.lastSeq = payload.s;

    switch (payload.op) {
      case Op.Hello: {
        const d = payload.d as { heartbeat_interval: number };
        this.heartbeatIntervalMs = d.heartbeat_interval;
        this.startHeartbeat();
        if (this.sessionId && this.lastSeq !== null) this.resume();
        else this.identify();
        break;
      }
      case Op.HeartbeatAck:
        this.acked = true;
        break;
      case Op.Heartbeat:
        this.sendHeartbeat();
        break;
      case Op.Reconnect:
        log.warn("gw", "server requested reconnect");
        this.ws?.close(4000);
        break;
      case Op.InvalidSession:
        log.warn("gw", "invalid session — re-identifying");
        this.sessionId = null;
        this.lastSeq = null;
        this.resumeUrl = null;
        setTimeout(() => this.identify(), 1_500);
        break;
      case Op.Dispatch:
        this.handleDispatch(payload);
        break;
      default:
        break;
    }
  }

  private handleDispatch(payload: GatewayPayload): void {
    if (payload.t === "READY") {
      const d = payload.d as { session_id?: string; resume_gateway_url?: string };
      this.sessionId = d.session_id ?? null;
      this.resumeUrl = d.resume_gateway_url ?? null;
      this.reconnectDelayMs = 1_000;
      log.gw("ready — listening");
      this.handlers.onReady?.();
      return;
    }
    if (payload.t === "RESUMED") {
      this.reconnectDelayMs = 1_000;
      log.gw("resumed");
      return;
    }
    if (payload.t === "MESSAGE_CREATE") {
      const msg = payload.d as DiscordMessage;
      if (msg?.id && msg.channel_id) this.handlers.onMessageCreate(msg);
    }
  }

  private identify(): void {
    this.send(Op.Identify, {
      token: this.token,
      capabilities: 16381,
      properties: {
        os: "Linux",
        browser: "Chrome",
        device: "",
        system_locale: "en-US",
        browser_user_agent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        browser_version: "120.0.0.0",
        os_version: "",
        release_channel: "stable",
        client_build_number: 9999,
      },
      presence: { status: "online", since: 0, activities: [], afk: false },
      compress: false,
      client_state: { guild_versions: {} },
    });
  }

  private resume(): void {
    log.gw("resuming session");
    this.send(Op.Resume, {
      token: this.token,
      session_id: this.sessionId,
      seq: this.lastSeq,
    });
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.acked = true;
    // Jitter the first beat per the gateway spec.
    setTimeout(() => this.sendHeartbeat(), this.heartbeatIntervalMs * Math.random());
    this.heartbeatTimer = setInterval(() => {
      if (!this.acked) {
        log.warn("gw", "heartbeat not acked — forcing reconnect");
        this.ws?.close(4000);
        return;
      }
      this.sendHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  private sendHeartbeat(): void {
    this.acked = false;
    this.send(Op.Heartbeat, this.lastSeq);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}
