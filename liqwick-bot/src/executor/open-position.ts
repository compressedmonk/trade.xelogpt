import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { BinanceFuturesClient } from "../binance/client.js";
import { quantityFromRisk, roundToStep, roundToTick } from "../risk/position-size.js";
import type { WickSignal } from "../strategy/types.js";
import type { Regime } from "../regime/detector.js";
import type { BotStore } from "../db/store.js";
import { log, logError } from "../util/logger.js";

export async function executeWickSignal(
  signal: WickSignal,
  regime: Regime,
  store: BotStore,
  client = new BinanceFuturesClient(),
): Promise<{ ok: boolean; tradeId?: string; error?: string }> {
  const slDistance = Math.abs(signal.entryPrice - signal.stopLoss);
  const slAtr = signal.atr > 0 ? slDistance / signal.atr : 0;
  if (slAtr < config.slMinAtr) return { ok: false, error: "sl too tight" };
  if (slAtr > config.slMaxAtr) return { ok: false, error: "sl too wide" };

  const info = await client.getExchangeInfo(signal.symbol);
  const filters = client.resolveSymbolFilters(info);
  const balance = await client.getBalanceUsdt();
  const qty = quantityFromRisk({
    balanceUsdt: balance,
    riskPct: config.defaultRiskPct,
    entry: signal.entryPrice,
    stopLoss: signal.stopLoss,
    filters,
    maxNotionalUsdt: config.maxNotionalUsdt,
  });

  if (qty <= 0) return { ok: false, error: "quantity zero" };

  const stopLoss = roundToTick(signal.stopLoss, filters.tickSize);
  const takeProfit1 = roundToTick(signal.takeProfit1, filters.tickSize);
  const takeProfit2 = roundToTick(signal.takeProfit2, filters.tickSize);
  const tp1Qty = roundToStep(qty * (config.tp1ClosePct / 100), filters.stepSize);
  const tp2Qty = roundToStep(qty - tp1Qty, filters.stepSize);
  const tradeId = randomUUID();

  store.logSignal({
    id: tradeId,
    symbol: signal.symbol,
    side: signal.side,
    entryPrice: signal.entryPrice,
    stopLoss,
    takeProfit: takeProfit2,
    takeProfit1,
    quantity: qty,
    regime,
    reason: signal.reason,
    score: signal.score.total,
    scoreBreakdown: signal.score,
    dryRun: config.dryRun,
  });

  if (config.dryRun) {
    log(
      "exec",
      `DRY_RUN ${signal.side.toUpperCase()} ${signal.symbol} score=${signal.score.total} qty=${qty} SL=${stopLoss} TP1=${takeProfit1} TP2=${takeProfit2}`,
    );
    store.createPosition({
      id: tradeId,
      symbol: signal.symbol,
      side: signal.side,
      entryPrice: signal.entryPrice,
      stopLoss,
      takeProfit: takeProfit2,
      takeProfit1,
      quantity: qty,
      regime,
      reason: signal.reason,
      score: signal.score.total,
      dryRun: true,
    });
    store.setCooldown(signal.symbol);
    return { ok: true, tradeId };
  }

  if (!config.binanceApiKey || !config.binanceApiSecret) {
    return { ok: false, error: "missing Binance API keys" };
  }

  try {
    const entrySide = signal.side === "long" ? "BUY" : "SELL";
    const exitSide = signal.side === "long" ? "SELL" : "BUY";

    const entry = await client.placeMarketOrder({
      symbol: signal.symbol,
      side: entrySide,
      quantity: qty,
    });

    const sl = await client.placeStopMarket({
      symbol: signal.symbol,
      side: exitSide,
      quantity: qty,
      stopPrice: stopLoss,
      reduceOnly: true,
    });

    let tp1OrderId: string | undefined;
    if (tp1Qty >= filters.minQty) {
      const tp1 = await client.placeTakeProfitMarket({
        symbol: signal.symbol,
        side: exitSide,
        quantity: tp1Qty,
        stopPrice: takeProfit1,
        reduceOnly: true,
      });
      tp1OrderId = String(tp1.orderId);
    }

    let tp2OrderId: string | undefined;
    if (tp2Qty >= filters.minQty) {
      const tp2 = await client.placeTakeProfitMarket({
        symbol: signal.symbol,
        side: exitSide,
        quantity: tp2Qty,
        stopPrice: takeProfit2,
        reduceOnly: true,
      });
      tp2OrderId = String(tp2.orderId);
    }

    store.createPosition({
      id: tradeId,
      symbol: signal.symbol,
      side: signal.side,
      entryPrice: Number(entry.avgPrice ?? entry.price) || signal.entryPrice,
      stopLoss,
      takeProfit: takeProfit2,
      takeProfit1,
      quantity: qty,
      regime,
      reason: signal.reason,
      score: signal.score.total,
      entryOrderId: String(entry.orderId),
      slOrderId: String(sl.orderId),
      tpOrderId: tp2OrderId,
      tp1OrderId,
      dryRun: false,
    });
    store.setCooldown(signal.symbol);

    log("exec", `LIVE ${signal.side.toUpperCase()} ${signal.symbol} score=${signal.score.total} order=${entry.orderId}`);
    return { ok: true, tradeId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError("exec", `failed ${signal.symbol}`, message);
    store.logEvent(null, "exec_error", { symbol: signal.symbol, error: message });
    return { ok: false, error: message };
  }
}
