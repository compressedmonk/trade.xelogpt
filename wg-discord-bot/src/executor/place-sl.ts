import { BinanceFuturesClient } from "../binance/client.js";
import { config } from "../config.js";
import type { OpenTrade, TradeStore } from "../db/store.js";
import { log } from "../util/logger.js";

export function filledQuantity(trade: OpenTrade): number {
  return trade.legs
    .filter((l) => l.status === "filled")
    .reduce((sum, l) => sum + l.quantity, 0);
}

export function computeAvgFillPrice(trade: OpenTrade): number | null {
  const filled = trade.legs.filter((l) => l.status === "filled" && l.fillPrice != null);
  if (filled.length === 0) return null;

  let qty = 0;
  let notional = 0;
  for (const leg of filled) {
    qty += leg.quantity;
    notional += leg.quantity * (leg.fillPrice ?? leg.limitPrice);
  }
  return qty > 0 ? notional / qty : null;
}

export async function placeStopLossIfNeeded(
  trade: OpenTrade,
  store: TradeStore,
  client?: BinanceFuturesClient,
  stopPrice?: number,
): Promise<void> {
  if (trade.slOrderId) return;

  const openQty = filledQuantity(trade);
  if (openQty <= 0) return;

  const sl = stopPrice ?? trade.signalStopLoss;
  const closeSide = trade.side === "long" ? "SELL" : "BUY";

  if (config.dryRun) {
    const dryId = `dry-sl-${trade.id.slice(0, 8)}`;
    store.setSlOrderId(trade.id, dryId);
    log.place(`DRY_RUN STOP_MARKET ${trade.symbol} qty=${openQty} stop=${sl}`);
    store.logEvent(trade.id, "sl_placed", { dryRun: true, stopPrice: sl, quantity: openQty });
    return;
  }

  const binance = client ?? new BinanceFuturesClient();
  const result = await binance.placeStopMarket({
    symbol: trade.symbol,
    side: closeSide,
    quantity: openQty,
    stopPrice: sl,
    reduceOnly: true,
  });
  store.setSlOrderId(trade.id, String(result.orderId));
  store.logEvent(trade.id, "sl_placed", { orderId: result.orderId, stopPrice: sl, quantity: openQty });
  log.place(`SL placed ${trade.symbol} @ ${sl} qty=${openQty}`);
}
