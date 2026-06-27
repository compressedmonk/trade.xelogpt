import WebSocket from "ws";
import { BinanceFuturesClient, type KlineBar } from "./client.js";
import { log, logError } from "../util/logger.js";

export interface KlineUpdate {
  symbol: string;
  bar: KlineBar;
}

export interface AggTradeUpdate {
  symbol: string;
  price: number;
  quantity: number;
  timestamp: number;
  isBuyerMaker: boolean;
}

export interface ForceOrderUpdate {
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  timestamp: number;
}

export interface MarkPriceUpdate {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  nextFundingTime: number;
  timestamp: number;
}

type KlineHandler = (update: KlineUpdate) => void;
type AggTradeHandler = (update: AggTradeUpdate) => void;
type ForceOrderHandler = (update: ForceOrderUpdate) => void;
type MarkPriceHandler = (update: MarkPriceUpdate) => void;

interface BinanceKlineMsg {
  stream: string;
  data: {
    e: string;
    E: number;
    s: string;
    k: {
      t: number;
      T: number;
      o: string;
      h: string;
      l: string;
      c: string;
      v: string;
      q: string;
      n: number;
      V: string;
      x: boolean;
    };
  };
}

interface BinanceAggTradeMsg {
  stream: string;
  data: {
    e: string;
    E: number;
    s: string;
    p: string;
    q: string;
    m: boolean;
  };
}

interface BinanceForceOrderMsg {
  stream: string;
  data: {
    e: string;
    E: number;
    o: {
      s: string;
      S: "BUY" | "SELL";
      p: string;
      q: string;
      T: number;
    };
  };
}

interface BinanceMarkPriceMsg {
  stream: string;
  data: {
    e: string;
    E: number;
    s: string;
    p: string;
    i: string;
    r: string;
    T: number;
  };
}

const HEALTHY_MS = 10_000;
const STALL_MS = 15_000;
const WATCHDOG_MS = 5_000;

export class BinanceStreamHub {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private readonly client = new BinanceFuturesClient();
  private connected = false;
  private lastMessageAt = 0;

  constructor(
    private readonly symbols: string[],
    private readonly onKline: KlineHandler,
    private readonly onAggTrade: AggTradeHandler,
    private readonly onForceOrder: ForceOrderHandler,
    private readonly onMarkPrice: MarkPriceHandler,
  ) {}

  start(): void {
    this.connect();
    this.startWatchdog();
  }

  stop(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.reconnectTimer = null;
    this.watchdogTimer = null;
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  isHealthy(): boolean {
    return (
      this.connected &&
      this.lastMessageAt > 0 &&
      Date.now() - this.lastMessageAt < HEALTHY_MS
    );
  }

  getLastMessageAt(): number | null {
    return this.lastMessageAt > 0 ? this.lastMessageAt : null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private connect(): void {
    const perSymbol = this.symbols.flatMap((s) => {
      const sym = s.toLowerCase();
      return [`${sym}@kline_1m`, `${sym}@aggTrade`, `${sym}@forceOrder`, `${sym}@markPrice@1s`];
    });
    const url = `${this.client.wsBaseUrl}/stream?streams=${perSymbol.join("/")}`;
    log("ws", `connecting ${this.symbols.length} symbols (${perSymbol.length} streams) → ${url.slice(0, 60)}...`);

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on("open", () => {
      this.connected = true;
      log("ws", "connected");
    });
    ws.on("message", (raw) => {
      this.lastMessageAt = Date.now();
      this.handleMessage(String(raw));
    });
    ws.on("close", () => {
      this.connected = false;
      log("ws", "disconnected — reconnect in 5s");
      this.scheduleReconnect();
    });
    ws.on("error", (err) => logError("ws", "socket error", err));
  }

  private startWatchdog(): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = setInterval(() => {
      if (!this.connected || this.lastMessageAt <= 0) return;
      const silentMs = Date.now() - this.lastMessageAt;
      if (silentMs >= STALL_MS) {
        log("ws", `stall ${Math.round(silentMs / 1000)}s — force reconnect`);
        this.forceReconnect();
      }
    }, WATCHDOG_MS);
  }

  private forceReconnect(): void {
    this.ws?.terminate();
    this.ws = null;
    this.connected = false;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 5000);
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw) as
        | BinanceKlineMsg
        | BinanceAggTradeMsg
        | BinanceForceOrderMsg
        | BinanceMarkPriceMsg;
      if (!msg.data?.e) return;

      if (msg.data.e === "kline") {
        const klineMsg = msg as BinanceKlineMsg;
        const k = klineMsg.data.k;
        this.onKline({
          symbol: klineMsg.data.s,
          bar: {
            openTime: k.t,
            open: Number(k.o),
            high: Number(k.h),
            low: Number(k.l),
            close: Number(k.c),
            volume: Number(k.v),
            quoteVolume: Number(k.q),
            tradeCount: k.n,
            takerBuyQuoteVolume: Number(k.V),
            closeTime: k.T,
            closed: k.x,
          },
        });
        return;
      }

      if (msg.data.e === "aggTrade") {
        const d = (msg as BinanceAggTradeMsg).data;
        this.onAggTrade({
          symbol: d.s,
          price: Number(d.p),
          quantity: Number(d.q),
          timestamp: d.E,
          isBuyerMaker: d.m,
        });
        return;
      }

      if (msg.data.e === "forceOrder") {
        const o = (msg as BinanceForceOrderMsg).data.o;
        this.onForceOrder({
          symbol: o.s,
          side: o.S,
          price: Number(o.p),
          quantity: Number(o.q),
          timestamp: o.T,
        });
        return;
      }

      if (msg.data.e === "markPriceUpdate") {
        const d = (msg as BinanceMarkPriceMsg).data;
        this.onMarkPrice({
          symbol: d.s,
          markPrice: Number(d.p),
          indexPrice: Number(d.i),
          fundingRate: Number(d.r),
          nextFundingTime: d.T,
          timestamp: d.E,
        });
      }
    } catch (err) {
      logError("ws", "parse error", err);
    }
  }
}
