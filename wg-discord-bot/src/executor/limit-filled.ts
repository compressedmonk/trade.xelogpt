import type { BinanceFuturesClient } from "../binance/client.js";
import type { OpenTrade, TradeStore } from "../db/store.js";
import { computeAvgFillPrice, placeStopLossIfNeeded } from "./place-sl.js";
import { log } from "../util/logger.js";

/** Mark the next pending DCA leg as filled (WG does not specify which step). */
export function applyLimitFilled(trade: OpenTrade, store: TradeStore): OpenTrade {
  const nextLeg = trade.legs.find((l) => l.status === "pending");
  if (!nextLeg) {
    log.alert(`limit_filled: no pending leg for ${trade.asset} @${trade.trader}`);
    return trade;
  }

  store.setLegStatus(trade.id, nextLeg.step, "filled", nextLeg.limitPrice);
  log.alert(`leg ${nextLeg.step} filled @ ${nextLeg.limitPrice} (${trade.asset})`);

  const updated = store.getTradeById(trade.id)!;
  const avg = computeAvgFillPrice(updated);
  if (avg != null) {
    store.setAvgFillPrice(trade.id, avg);
  }

  const filledCount = updated.legs.filter((l) => l.status === "filled").length;
  const totalLegs = updated.legs.length;
  const status = filledCount >= totalLegs ? "active" : "partial_fill";
  store.updateTradeStatus(trade.id, status);

  return store.getTradeById(trade.id)!;
}

export async function handleLimitFilled(
  trade: OpenTrade,
  store: TradeStore,
  client?: BinanceFuturesClient,
): Promise<void> {
  const updated = applyLimitFilled(trade, store);
  const hadSl = Boolean(trade.slOrderId);
  await placeStopLossIfNeeded(updated, store, client);
  if (!hadSl && updated.legs.some((l) => l.status === "filled")) {
    log.alert(`initial SL at signal stop ${updated.signalStopLoss}`);
  }
}
