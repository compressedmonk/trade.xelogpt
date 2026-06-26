import { BinanceFuturesClient } from "../binance/client.js";
import { config } from "../config.js";
import type { OpenTrade, TradeStore } from "../db/store.js";
import type { AlertAction, ParsedAlert } from "../parser/types.js";
import { shouldExecuteAlert } from "../parser/alert-signal.js";
import { handleLimitFilled } from "./limit-filled.js";
import { filledQuantity, placeStopLossIfNeeded } from "./place-sl.js";
import { log } from "../util/logger.js";
import { msgTiming } from "../util/event-time.js";

function eventTrader(trader: string | undefined): string {
  return trader?.trim() || "unknown";
}

function skipReason(alert: ParsedAlert): string {
  const skip = alert.actions.find((a) => a.type === "skip");
  if (skip?.reason === "stock_ticker") {
    return "Stock/index alert — futures bot ignores it";
  }
  if (skip?.reason === "not_followed") {
    return `Trader @${eventTrader(alert.trader)} not in FOLLOWED_TRADERS`;
  }
  const action = alert.actions[0]?.type ?? "unknown";
  return `Alert action "${action}" marked as skip`;
}

function noTradeReason(alert: ParsedAlert, store: TradeStore): string {
  const trader = eventTrader(alert.trader);
  const asset = alert.asset;
  const action = alert.actions[0]?.type ?? "unknown";
  const latest = store.findLatestTrade(trader, asset);

  if (!latest) {
    return `No journal entry for @${trader}/${asset} — "${action}" alert has nothing to attach to (missed entry signal or backfill replay)`;
  }
  if (latest.status === "closed") {
    return `@${trader}/${asset} already closed in journal — "${action}" alert is stale or backfill replay`;
  }
  return `No open trade for @${trader}/${asset} despite journal row (status=${latest.status})`;
}

function alertEventPayload(
  alert: ParsedAlert,
  extra: { reason: string; actionType?: string },
): Record<string, unknown> {
  return {
    ...msgTiming(alert.sourceMessageId),
    trader: eventTrader(alert.trader),
    asset: alert.asset,
    actionType: extra.actionType ?? alert.actions[0]?.type ?? "unknown",
    reason: extra.reason,
    actions: alert.actions,
    rawText: alert.rawText.slice(0, 240),
  };
}

export async function executeAlert(
  alert: ParsedAlert,
  store: TradeStore,
  client?: BinanceFuturesClient,
): Promise<void> {
  if (!shouldExecuteAlert(alert)) {
    log.alert(`skip ${alert.asset} @${eventTrader(alert.trader)}: ${alert.actions[0]?.type}`);
    store.logEvent(
      null,
      "alert_skip",
      alertEventPayload(alert, { reason: skipReason(alert) }),
    );
    return;
  }

  let trade = store.findOpenTrade(alert.trader, alert.asset);
  if (!trade) {
    log.alert(`no open trade for ${alert.asset} @${eventTrader(alert.trader)}`);
    store.logEvent(
      null,
      "alert_no_trade",
      alertEventPayload(alert, { reason: noTradeReason(alert, store) }),
    );
    return;
  }

  const binance = client ?? new BinanceFuturesClient();

  for (const action of alert.actions) {
    trade =
      (await executeAction(action, trade, store, binance, alert.sourceMessageId)) ?? trade;
  }
}

async function executeAction(
  action: AlertAction,
  trade: OpenTrade,
  store: TradeStore,
  binance: BinanceFuturesClient,
  sourceMessageId?: string,
): Promise<OpenTrade | null> {
  const timing = msgTiming(sourceMessageId);
  switch (action.type) {
    case "cancel_limit": {
      for (const leg of trade.legs) {
        if (leg.status === "pending" && leg.orderId) {
          if (!config.dryRun) {
            await binance.cancelOrder(trade.symbol, leg.orderId);
          } else {
            log.place(`DRY_RUN cancel leg ${leg.step} order ${leg.orderId}`);
          }
          store.setLegStatus(trade.id, leg.step, "cancelled");
        }
      }
      store.updateTradeStatus(trade.id, "closed");
      store.logEvent(trade.id, "cancel_limit", { ...action, ...timing });
      return store.getTradeById(trade.id);
    }

    case "limit_filled": {
      await handleLimitFilled(trade, store, binance);
      store.logEvent(trade.id, "limit_filled", { ...action, ...timing });
      return store.getTradeById(trade.id);
    }

    case "move_sl": {
      const slPrice =
        action.newSl === "BE"
          ? trade.avgFillPrice ?? (trade.signalEntryMin + trade.signalEntryMax) / 2
          : action.newSl;

      if (trade.slOrderId) {
        if (!config.dryRun) {
          await binance.cancelOrder(trade.symbol, trade.slOrderId);
        } else {
          log.place(`DRY_RUN cancel old SL ${trade.slOrderId}`);
        }
        store.clearSlOrderId(trade.id);
      }

      const refreshed = store.getTradeById(trade.id)!;
      if (config.dryRun) {
        log.place(`DRY_RUN move SL ${trade.symbol} → ${slPrice}`);
      }
      await placeStopLossIfNeeded(refreshed, store, binance, slPrice);
      store.logEvent(trade.id, "move_sl", { ...action, slPrice, ...timing });
      return store.getTradeById(trade.id);
    }

    case "immediate_close": {
      for (const leg of trade.legs) {
        if (leg.status === "pending" && leg.orderId) {
          if (!config.dryRun) {
            await binance.cancelOrder(trade.symbol, leg.orderId);
          }
          store.setLegStatus(trade.id, leg.step, "cancelled");
        }
      }

      const filledQty = filledQuantity(trade);
      const closeQty = filledQty * (action.closePct / 100);

      if (closeQty > 0) {
        const closeSide = trade.side === "long" ? "SELL" : "BUY";
        if (config.dryRun) {
          log.place(`DRY_RUN MARKET close ${closeQty} ${trade.symbol} (${action.closePct}%)`);
        } else {
          await binance.placeMarketOrder({
            symbol: trade.symbol,
            side: closeSide,
            quantity: closeQty,
            reduceOnly: true,
          });
        }
      }

      if (action.closePct >= 100) store.updateTradeStatus(trade.id, "closed");
      store.logEvent(trade.id, "immediate_close", { ...action, closeQty, ...timing });
      return store.getTradeById(trade.id);
    }

    case "skip":
      store.logEvent(trade.id, "alert_skip", { ...action, ...timing });
      return trade;
  }
}
