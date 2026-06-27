import type { ForceOrderUpdate } from "../binance/websocket.js";

interface LiqEvent {
  timestamp: number;
  notional: number;
  side: "BUY" | "SELL";
}

export class LiquidationTracker {
  private events: LiqEvent[] = [];
  private baselineNotional = 0;

  constructor(private readonly windowMs: number) {}

  add(order: ForceOrderUpdate): void {
    const notional = order.price * order.quantity;
    this.events.push({ timestamp: order.timestamp, notional, side: order.side });
    this.prune(order.timestamp);
    this.updateBaseline();
  }

  /** Long liq wick = longs liquidated = SELL force orders. */
  longLiqNotional(): number {
    return this.sumNotional("SELL");
  }

  /** Short liq wick = shorts liquidated = BUY force orders. */
  shortLiqNotional(): number {
    return this.sumNotional("BUY");
  }

  burstRatio(side: "long" | "short"): number {
    const current = side === "long" ? this.longLiqNotional() : this.shortLiqNotional();
    if (this.baselineNotional <= 0) return current > 0 ? 2 : 0;
    return current / this.baselineNotional;
  }

  private sumNotional(side: "BUY" | "SELL"): number {
    return this.events.filter((e) => e.side === side).reduce((s, e) => s + e.notional, 0);
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    this.events = this.events.filter((e) => e.timestamp >= cutoff);
  }

  private updateBaseline(): void {
    if (this.events.length < 5) {
      this.baselineNotional = this.events.reduce((s, e) => s + e.notional, 0) / Math.max(this.events.length, 1);
      return;
    }
    const avg = this.events.reduce((s, e) => s + e.notional, 0) / this.events.length;
    this.baselineNotional = this.baselineNotional * 0.9 + avg * 0.1;
  }
}
