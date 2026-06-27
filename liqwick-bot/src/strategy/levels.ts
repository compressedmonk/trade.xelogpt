import type { KlineBar } from "../binance/client.js";
import type { BinanceFuturesClient } from "../binance/client.js";

export type LevelType =
  | "swing_low"
  | "swing_high"
  | "prev_day_low"
  | "prev_day_high"
  | "round";

export interface SignificantLevel {
  price: number;
  weight: number;
  type: LevelType;
  side: "support" | "resistance";
}

function fractalSwings(bars: KlineBar[], lookback: number): SignificantLevel[] {
  const closed = bars.filter((b) => b.closed);
  const levels: SignificantLevel[] = [];
  if (closed.length < lookback * 2 + 1) return levels;

  for (let i = lookback; i < closed.length - lookback; i++) {
    const bar = closed[i];
    let isLow = true;
    let isHigh = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (closed[j].low <= bar.low) isLow = false;
      if (closed[j].high >= bar.high) isHigh = false;
    }
    if (isLow) {
      levels.push({ price: bar.low, weight: 1 + lookback * 0.1, type: "swing_low", side: "support" });
    }
    if (isHigh) {
      levels.push({ price: bar.high, weight: 1 + lookback * 0.1, type: "swing_high", side: "resistance" });
    }
  }
  return levels;
}

function roundLevels(price: number): SignificantLevel[] {
  if (price <= 0) return [];
  const magnitude = Math.pow(10, Math.floor(Math.log10(price)));
  const step = magnitude >= 1000 ? magnitude / 10 : magnitude >= 100 ? 50 : magnitude >= 10 ? 5 : 1;
  const base = Math.floor(price / step) * step;
  const levels: SignificantLevel[] = [];
  for (let i = -2; i <= 2; i++) {
    const p = base + i * step;
    if (p <= 0) continue;
    levels.push({
      price: p,
      weight: 0.8,
      type: "round",
      side: p < price ? "support" : "resistance",
    });
  }
  return levels;
}

export function buildLevelsFromBars(
  bars5m: KlineBar[],
  bars15m: KlineBar[],
  bars1h: KlineBar[],
  bars1d: KlineBar[],
  currentPrice: number,
  fractalLookback: number,
): SignificantLevel[] {
  const levels: SignificantLevel[] = [
    ...fractalSwings(bars5m, fractalLookback).map((l) => ({ ...l, weight: l.weight * 1.0 })),
    ...fractalSwings(bars15m, fractalLookback).map((l) => ({ ...l, weight: l.weight * 1.2 })),
    ...fractalSwings(bars1h, fractalLookback).map((l) => ({ ...l, weight: l.weight * 1.5 })),
    ...roundLevels(currentPrice),
  ];

  const daily = bars1d.filter((b) => b.closed);
  if (daily.length >= 2) {
    const prev = daily[daily.length - 2];
    levels.push(
      { price: prev.low, weight: 2.0, type: "prev_day_low", side: "support" },
      { price: prev.high, weight: 2.0, type: "prev_day_high", side: "resistance" },
    );
  } else if (daily.length === 1) {
    levels.push(
      { price: daily[0].low, weight: 1.5, type: "prev_day_low", side: "support" },
      { price: daily[0].high, weight: 1.5, type: "prev_day_high", side: "resistance" },
    );
  }

  return dedupeLevels(levels);
}

function dedupeLevels(levels: SignificantLevel[]): SignificantLevel[] {
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const out: SignificantLevel[] = [];
  for (const level of sorted) {
    const existing = out.find((l) => Math.abs(l.price - level.price) / level.price < 0.0005);
    if (existing) {
      existing.weight = Math.max(existing.weight, level.weight);
    } else {
      out.push({ ...level });
    }
  }
  return out;
}

export async function fetchLevelsForSymbol(
  client: BinanceFuturesClient,
  symbol: string,
  fractalLookback: number,
): Promise<SignificantLevel[]> {
  const [bars5m, bars15m, bars1h, bars1d] = await Promise.all([
    client.getKlines(symbol, "5m", 120),
    client.getKlines(symbol, "15m", 96),
    client.getKlines(symbol, "1h", 72),
    client.getKlines(symbol, "1d", 5),
  ]);
  const currentPrice = bars5m.at(-1)?.close ?? bars1h.at(-1)?.close ?? 0;
  return buildLevelsFromBars(bars5m, bars15m, bars1h, bars1d, currentPrice, fractalLookback);
}

export function nearestSupport(levels: SignificantLevel[], price: number): SignificantLevel | null {
  const supports = levels.filter((l) => l.side === "support");
  if (supports.length === 0) return null;
  const above = supports.filter((l) => l.price >= price);
  if (above.length > 0) {
    return above.reduce((best, l) => (l.price < best.price ? l : best));
  }
  return supports.reduce((best, l) => (l.price > best.price ? l : best));
}

export function nearestResistance(levels: SignificantLevel[], price: number): SignificantLevel | null {
  const resistances = levels.filter((l) => l.side === "resistance");
  if (resistances.length === 0) return null;
  const below = resistances.filter((l) => l.price <= price);
  if (below.length > 0) {
    return below.reduce((best, l) => (l.price > best.price ? l : best));
  }
  return resistances.reduce((best, l) => (l.price < best.price ? l : best));
}

export function sweepDepthAtr(
  price: number,
  level: SignificantLevel,
  side: "long" | "short",
): number {
  if (side === "long") {
    return Math.max(0, (level.price - price) / level.price);
  }
  return Math.max(0, (price - level.price) / level.price);
}
