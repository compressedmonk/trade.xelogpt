import type { KlineBar } from "../binance/client.js";

export function trueRange(prevClose: number, bar: KlineBar): number {
  return Math.max(
    bar.high - bar.low,
    Math.abs(bar.high - prevClose),
    Math.abs(bar.low - prevClose),
  );
}

/** Wilder-smoothed ATR from closed bars. */
export function computeAtr(bars: KlineBar[], period = 14): number {
  const closed = bars.filter((b) => b.closed);
  if (closed.length < period + 1) return 0;

  const trs: number[] = [];
  for (let i = 1; i < closed.length; i++) {
    trs.push(trueRange(closed[i - 1].close, closed[i]));
  }

  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

export function rollingAverage(values: number[], window: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-window);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export interface VolumeBaseline {
  quoteVolumeAvg: number;
  tradeCountAvg: number;
}

export function volumeBaseline(bars: KlineBar[], window = 20): VolumeBaseline {
  const closed = bars.filter((b) => b.closed).slice(-window);
  if (closed.length === 0) return { quoteVolumeAvg: 0, tradeCountAvg: 0 };

  const quoteVolumes = closed.map((b) => b.quoteVolume ?? b.volume * b.close);
  const tradeCounts = closed.map((b) => b.tradeCount ?? 0);

  return {
    quoteVolumeAvg: rollingAverage(quoteVolumes, window),
    tradeCountAvg: rollingAverage(tradeCounts, window),
  };
}

export function takerSellRatio(bar: KlineBar): number {
  const quote = bar.quoteVolume ?? bar.volume * bar.close;
  const takerBuy = bar.takerBuyQuoteVolume ?? quote * 0.5;
  if (quote <= 0) return 0.5;
  return 1 - takerBuy / quote;
}
