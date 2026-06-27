import { BinanceFuturesClient } from "../binance/client.js";
import { config } from "../config.js";
import type { BotStore, StoredPosition } from "../db/store.js";
import { roundToStep, roundToTick } from "../risk/position-size.js";
import { log, logError } from "../util/logger.js";

/** Move stop-loss to breakeven after TP1 fills (live) or price crosses TP1 (dry run). */
export class PositionManager {
  constructor(
    private readonly store: BotStore,
    private readonly client = new BinanceFuturesClient(),
  ) {}

  async tick(): Promise<void> {
    const positions = this.store.listPositions(100).filter((p) => p.status === "active");
    for (const pos of positions) {
      if (!pos.takeProfit1 || this.store.isSlAtBreakeven(pos.id)) continue;
      try {
        if (pos.dryRun) await this.handleDryRun(pos);
        else await this.handleLive(pos);
      } catch (err) {
        logError("position", `manage ${pos.symbol}`, err);
      }
    }
  }

  private async handleDryRun(pos: StoredPosition): Promise<void> {
    const mark = await this.client.getMarkPrice(pos.symbol);
    const hit =
      pos.side === "long" ? mark >= pos.takeProfit1! : mark <= pos.takeProfit1!;
    if (!hit) return;
    this.moveSlToBreakeven(pos, pos.entryPrice);
  }

  private async handleLive(pos: StoredPosition): Promise<void> {
    if (!pos.tp1OrderId) return;
    const order = await this.client.getOrder(pos.symbol, pos.tp1OrderId);
    if (order.status !== "FILLED") return;

    const info = await this.client.getExchangeInfo(pos.symbol);
    const filters = this.client.resolveSymbolFilters(info);
    const tp1Qty = roundToStep(pos.quantity * (config.tp1ClosePct / 100), filters.stepSize);
    const remainQty = roundToStep(pos.quantity - tp1Qty, filters.stepSize);
    if (remainQty < filters.minQty) return;

    if (pos.slOrderId) {
      try {
        await this.client.cancelOrder(pos.symbol, pos.slOrderId);
      } catch {
        /* SL may already be gone */
      }
    }

    const exitSide = pos.side === "long" ? "SELL" : "BUY";
    const beStop = roundToTick(pos.entryPrice, filters.tickSize);
    const sl = await this.client.placeStopMarket({
      symbol: pos.symbol,
      side: exitSide,
      quantity: remainQty,
      stopPrice: beStop,
      reduceOnly: true,
    });

    this.store.updateStopLoss(pos.id, beStop, String(sl.orderId));
    this.store.markSlAtBreakeven(pos.id);
    this.store.logEvent(pos.id, "sl_moved_to_be", { stopLoss: beStop, remainQty });
    log("position", `${pos.symbol} SL → BE @ ${beStop} (TP1 filled)`);
  }

  private moveSlToBreakeven(pos: StoredPosition, stopLoss: number): void {
    this.store.updateStopLoss(pos.id, stopLoss);
    this.store.markSlAtBreakeven(pos.id);
    this.store.logEvent(pos.id, "sl_moved_to_be", { stopLoss, dryRun: true });
    log("position", `DRY_RUN ${pos.symbol} SL → BE @ ${stopLoss}`);
  }
}
