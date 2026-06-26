import { BinanceFuturesClient, resolveSymbol } from "../binance/client.js";
import { config } from "../config.js";
import type { TradeStore } from "../db/store.js";
import type { DcaPlan } from "../execution/dca-ladder.js";
import { isValidForExecution } from "../parser/limit-signal.js";
import { isFollowedTrader } from "../parser/trader-filter.js";
import type { ParsedLimitSignal } from "../parser/types.js";
import { buildSizedDcaPlan } from "../risk/position-size.js";
import { log } from "../util/logger.js";
import { msgTiming } from "../util/event-time.js";

export interface PlaceResult {
  tradeId: string;
  plan: DcaPlan;
  dryRun: boolean;
}

export async function placeDcaTrade(
  signal: ParsedLimitSignal,
  store: TradeStore,
  client?: BinanceFuturesClient,
): Promise<PlaceResult | null> {
  if (!isValidForExecution(signal)) {
    log.place(`skip: status=${signal.status}`);
    return null;
  }

  if (!isFollowedTrader(signal.trader)) {
    const trader = signal.trader?.trim() || "unknown";
    log.place(`skip: trader @${trader} not in FOLLOWED_TRADERS`);
    store.logEvent(null, "skip_not_followed", {
      ...msgTiming(signal.sourceMessageId),
      trader,
      asset: signal.asset,
      reason: `Trader @${trader} not in FOLLOWED_TRADERS`,
    });
    return null;
  }

  const existing = store.findOpenTrade(signal.trader, signal.asset);
  if (existing) {
    log.place(`skip: open trade already exists for ${signal.asset} @${signal.trader}`);
    store.logEvent(existing.id, "skip_duplicate", {
      ...msgTiming(signal.sourceMessageId),
      trader: existing.trader || "unknown",
      asset: signal.asset,
      reason: `Open trade already exists for @${existing.trader || "unknown"}/${signal.asset}`,
    });
    return null;
  }

  const symbol = resolveSymbol(signal.asset);
  const binance = client ?? new BinanceFuturesClient();

  let filters;
  let balance = config.defaultBalanceUsdt;

  if (config.dryRun) {
    filters = { stepSize: 0.001, tickSize: 0.0001, minQty: 0.001 };
  } else {
    const info = await binance.getExchangeInfo(symbol);
    if (!info) {
      log.place(`skip: ${symbol} not listed`);
      store.logEvent(null, "skip_no_listing", { symbol });
      return null;
    }
    filters = binance.resolveSymbolFilters(info);
    balance = await binance.getBalanceUsdt();
  }

  const plan = buildSizedDcaPlan(signal, balance, filters);

  if (config.dryRun) {
    log.place(`DRY_RUN DCA plan for ${symbol}`, plan);
    const trade = store.createTrade(signal, plan);
    for (const leg of plan.legs) {
      store.setLegOrderId(trade.id, leg.step, `dry-${trade.id.slice(0, 8)}-L${leg.step}`);
    }
    store.logEvent(trade.id, "dry_run_orders", { ...plan, ...msgTiming(signal.sourceMessageId) });
    return { tradeId: trade.id, plan, dryRun: true };
  }

  const trade = store.createTrade(signal, plan);
  const orderSide = signal.side === "long" ? "BUY" : "SELL";

  for (const leg of plan.legs) {
    const result = await binance.placeLimitOrder({
      symbol,
      side: orderSide,
      quantity: leg.quantity,
      price: leg.price,
    });
    store.setLegOrderId(trade.id, leg.step, String(result.orderId));
    store.logEvent(trade.id, "order_placed", { step: leg.step, orderId: result.orderId });
  }

  return { tradeId: trade.id, plan, dryRun: false };
}
