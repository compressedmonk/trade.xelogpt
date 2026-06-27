import type { KlineBar } from "../binance/client.js";

export interface SwingLevels {
  swingLow: number;
  swingHigh: number;
}

export function swingLevelsFromClosedBars(bars: KlineBar[], lookback: number): SwingLevels {
  const closed = bars.filter((b) => b.closed).slice(-lookback);
  if (closed.length === 0) {
    return { swingLow: 0, swingHigh: 0 };
  }
  let swingLow = Infinity;
  let swingHigh = -Infinity;
  for (const bar of closed) {
    if (bar.low < swingLow) swingLow = bar.low;
    if (bar.high > swingHigh) swingHigh = bar.high;
  }
  return { swingLow, swingHigh };
}

export function mergeClosedBar(history: KlineBar[], bar: KlineBar): KlineBar[] {
  const next = [...history];
  const idx = next.findIndex((b) => b.openTime === bar.openTime);
  if (idx >= 0) {
    next[idx] = bar;
  } else {
    next.push(bar);
  }
  return next.filter((b) => b.closed).slice(-500);
}
