import { getKlines, getPerpSymbols, type AphaKlineBar } from "./apha-binance";

export const GENERATION_VERSION = 5;
export const BOT_INCEPTION = Date.parse("2026-04-12T00:00:00Z");
export const DAY_MS = 24 * 60 * 60 * 1000;
export const SL_PCT = 0.02;
export const DAY_KLINE_INTERVAL = "15m";
export const MARGIN_USDT = 550;
export const STARTING_CAPITAL_USDT = 10_000;
/** Target share of closed trades that hit stop loss */
export const SL_RATIO = 0.146;
/** Target share of closed trades that hit take profit (remainder → break-even) */
export const PROFIT_RATIO = 0.42;
/** Max symbols to trade per day (actual count is 1–2, deterministic per day) */
export const SYMBOLS_PER_DAY = 2;

const OUTCOME_POOL_SIZE = 500;

/** Binance USDT-M futures taker fee per fill */
const TAKER_FEE_RATE = 0.0004;
/** Adverse exit slippage on underlying (percent) */
const BE_SLIPPAGE_PCT_MIN = 0.012;
const BE_SLIPPAGE_PCT_MAX = 0.048;

function buildBePnl(
  side: TradeSide,
  entryPrice: number,
  leverage: number,
  rng: () => number,
): { exitPrice: number; priceMovePct: number; pnlPct: number; pnlUsdt: number } {
  const slippagePct = BE_SLIPPAGE_PCT_MIN + rng() * (BE_SLIPPAGE_PCT_MAX - BE_SLIPPAGE_PCT_MIN);
  const exitPrice =
    side === "LONG"
      ? entryPrice * (1 - slippagePct / 100)
      : entryPrice * (1 + slippagePct / 100);

  const priceMovePct =
    side === "LONG"
      ? ((exitPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - exitPrice) / entryPrice) * 100;

  const tradingPnlPct = priceMovePct * leverage;
  const roundTripFeePct = leverage * TAKER_FEE_RATE * 2 * 100;
  const pnlPct = tradingPnlPct - roundTripFeePct;
  const pnlUsdt = (MARGIN_USDT * pnlPct) / 100;

  return { exitPrice, priceMovePct, pnlPct, pnlUsdt };
}

export type TradeOutcome = "profit" | "be" | "sl";
export type TradeSide = "LONG" | "SHORT";

export interface AphaTrade {
  id: string;
  symbol: string;
  side: TradeSide;
  leverage: number;
  outcome: TradeOutcome;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  priceMovePct: number;
  pnlPct: number;
  pnlUsdt: number;
  marginUsdt: number;
  dayIndex: number;
}

export interface AphaStats {
  totalTrades: number;
  winRate: number;
  beRate: number;
  slRate: number;
  profitRate: number;
  avgPnlPct: number;
  totalPnlUsdt: number;
  avgLeverage: number;
  startingCapitalUsdt: number;
  roiPct: number;
}

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getCompletedDayIndices(now = Date.now()): number[] {
  const indices: number[] = [];
  let dayIndex = 0;
  while (true) {
    const dayEnd = BOT_INCEPTION + (dayIndex + 1) * DAY_MS;
    if (dayEnd > now) break;
    indices.push(dayIndex);
    dayIndex++;
  }
  return indices;
}

function dayRange(dayIndex: number): { start: number; end: number } {
  return {
    start: BOT_INCEPTION + dayIndex * DAY_MS,
    end: BOT_INCEPTION + (dayIndex + 1) * DAY_MS,
  };
}

/** Deterministic trade count for a day (1 or 2). */
export function getDayTradeCount(dayIndex: number): number {
  const rng = mulberry32(hashSeed(`day-count:v${GENERATION_VERSION}:${dayIndex}`));
  return 1 + Math.floor(rng() * 2);
}

/** Cumulative global outcome-pool offset before this day. */
export function getGlobalOutcomeIndexForDay(dayIndex: number): number {
  let total = 0;
  for (let d = 0; d < dayIndex; d++) {
    total += getDayTradeCount(d);
  }
  return total;
}

/** Build a large shuffled outcome pool with correct TP/BE/SL ratios. */
export function buildOutcomePool(size = OUTCOME_POOL_SIZE): TradeOutcome[] {
  const slCount = Math.round(size * SL_RATIO);
  const profitCount = Math.round(size * PROFIT_RATIO);
  const beCount = Math.max(0, size - slCount - profitCount);

  const outcomes: TradeOutcome[] = [
    ...Array(profitCount).fill("profit" as TradeOutcome),
    ...Array(beCount).fill("be" as TradeOutcome),
    ...Array(slCount).fill("sl" as TradeOutcome),
  ];

  const rng = mulberry32(hashSeed(`outcome-pool:v${GENERATION_VERSION}`));
  for (let i = outcomes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [outcomes[i], outcomes[j]] = [outcomes[j], outcomes[i]];
  }
  return outcomes;
}

export function pickSymbolsForDay(allSymbols: string[], dayIndex: number, count: number): string[] {
  const rng = mulberry32(hashSeed(`day-symbols:v${GENERATION_VERSION}:${dayIndex}`));
  const pool = [...allSymbols];
  const picked: string[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

/** Deterministic daily plan: 1–2 symbols, one trade each. */
export function planDay(
  allSymbols: string[],
  dayIndex: number,
): { symbols: string[]; tradeCount: number } {
  const tradeCount = getDayTradeCount(dayIndex);
  const symbols = pickSymbolsForDay(allSymbols, dayIndex, tradeCount);
  return { symbols, tradeCount: symbols.length };
}

function firstTouch(
  side: TradeSide,
  bar: AphaKlineBar,
  sl: number,
  tp: number,
): "sl" | "tp" | null {
  if (side === "LONG") {
    const slHit = bar.low <= sl;
    const tpHit = bar.high >= tp;
    if (slHit && tpHit) return bar.open <= (sl + tp) / 2 ? "sl" : "tp";
    if (slHit) return "sl";
    if (tpHit) return "tp";
  } else {
    const slHit = bar.high >= sl;
    const tpHit = bar.low <= tp;
    if (slHit && tpHit) return bar.open >= (sl + tp) / 2 ? "sl" : "tp";
    if (slHit) return "sl";
    if (tpHit) return "tp";
  }
  return null;
}

function findMatchingTrade(
  klines: AphaKlineBar[],
  outcome: TradeOutcome,
  side: TradeSide,
  rng: () => number,
): Omit<AphaTrade, "id" | "symbol" | "dayIndex"> | null {
  if (klines.length < 20) return null;

  for (let attempt = 0; attempt < 80; attempt++) {
    const entryIdx = 2 + Math.floor(rng() * (klines.length - 12));
    const entryBar = klines[entryIdx];
    const entryPrice = entryBar.low + rng() * (entryBar.high - entryBar.low);
    const leverage = 3 + Math.floor(rng() * 4);
    const rMult = 1.2 + rng() * 1.3;

    let sl: number;
    let tp: number;
    if (side === "LONG") {
      sl = entryPrice * (1 - SL_PCT);
      tp = entryPrice * (1 + SL_PCT * rMult);
    } else {
      sl = entryPrice * (1 + SL_PCT);
      tp = entryPrice * (1 - SL_PCT * rMult);
    }

    const entryTime = entryBar.openTime + Math.floor(rng() * 14 * 60 * 1000);

    if (outcome === "be") {
      let movedFavor = false;
      for (let i = entryIdx + 1; i < klines.length; i++) {
        const bar = klines[i];
        if (side === "LONG") {
          if (bar.high >= entryPrice * 1.005) movedFavor = true;
          if (bar.low <= sl) break;
          if (movedFavor && Math.abs(bar.close - entryPrice) / entryPrice < 0.001) {
            const be = buildBePnl(side, entryPrice, leverage, rng);
            return {
              side,
              leverage,
              outcome,
              entryTime,
              exitTime: bar.openTime,
              entryPrice,
              exitPrice: be.exitPrice,
              priceMovePct: be.priceMovePct,
              pnlPct: be.pnlPct,
              pnlUsdt: be.pnlUsdt,
              marginUsdt: MARGIN_USDT,
            };
          }
        } else {
          if (bar.low <= entryPrice * 0.995) movedFavor = true;
          if (bar.high >= sl) break;
          if (movedFavor && Math.abs(bar.close - entryPrice) / entryPrice < 0.001) {
            const be = buildBePnl(side, entryPrice, leverage, rng);
            return {
              side,
              leverage,
              outcome,
              entryTime,
              exitTime: bar.openTime,
              entryPrice,
              exitPrice: be.exitPrice,
              priceMovePct: be.priceMovePct,
              pnlPct: be.pnlPct,
              pnlUsdt: be.pnlUsdt,
              marginUsdt: MARGIN_USDT,
            };
          }
        }
      }
      continue;
    }

    for (let i = entryIdx + 1; i < klines.length; i++) {
      const bar = klines[i];
      const touch = firstTouch(side, bar, sl, tp);
      if (!touch) continue;

      if (outcome === "sl" && touch === "sl") {
        const exitPrice = sl;
        const priceMovePct =
          side === "LONG"
            ? ((exitPrice - entryPrice) / entryPrice) * 100
            : ((entryPrice - exitPrice) / entryPrice) * 100;
        const pnlPct = priceMovePct * leverage;
        return {
          side,
          leverage,
          outcome,
          entryTime,
          exitTime: bar.openTime,
          entryPrice,
          exitPrice,
          priceMovePct,
          pnlPct,
          pnlUsdt: (MARGIN_USDT * pnlPct) / 100,
          marginUsdt: MARGIN_USDT,
        };
      }

      if (outcome === "profit" && touch === "tp") {
        const exitPrice = tp;
        const priceMovePct =
          side === "LONG"
            ? ((exitPrice - entryPrice) / entryPrice) * 100
            : ((entryPrice - exitPrice) / entryPrice) * 100;
        const pnlPct = priceMovePct * leverage;
        return {
          side,
          leverage,
          outcome,
          entryTime,
          exitTime: bar.openTime,
          entryPrice,
          exitPrice,
          priceMovePct,
          pnlPct,
          pnlUsdt: (MARGIN_USDT * pnlPct) / 100,
          marginUsdt: MARGIN_USDT,
        };
      }

      break;
    }
  }

  if (outcome === "be" && klines.length >= 20) {
    return synthesizeBeTrade(klines, side, rng);
  }

  return null;
}

function synthesizeBeTrade(
  klines: AphaKlineBar[],
  side: TradeSide,
  rng: () => number,
): Omit<AphaTrade, "id" | "symbol" | "dayIndex"> {
  const entryIdx = 2 + Math.floor(rng() * (klines.length - 8));
  const entryBar = klines[entryIdx];
  const entryPrice = entryBar.low + rng() * (entryBar.high - entryBar.low);
  const leverage = 3 + Math.floor(rng() * 4);
  const exitIdx = Math.min(entryIdx + 1 + Math.floor(rng() * 5), klines.length - 1);
  const exitBar = klines[exitIdx];
  const be = buildBePnl(side, entryPrice, leverage, rng);

  return {
    side,
    leverage,
    outcome: "be",
    entryTime: entryBar.openTime + Math.floor(rng() * 12 * 60 * 1000),
    exitTime: exitBar.openTime,
    entryPrice,
    exitPrice: be.exitPrice,
    priceMovePct: be.priceMovePct,
    pnlPct: be.pnlPct,
    pnlUsdt: be.pnlUsdt,
    marginUsdt: MARGIN_USDT,
  };
}

async function generateTradesForSymbolDay(
  symbol: string,
  dayIndex: number,
  outcomes: TradeOutcome[],
  rng: () => number,
): Promise<AphaTrade[]> {
  const { start, end } = dayRange(dayIndex);
  const klines = await getKlines(symbol, DAY_KLINE_INTERVAL, start, end - 1, 500);
  if (klines.length < 20) return [];

  const trades: AphaTrade[] = [];

  for (let i = 0; i < outcomes.length; i++) {
    const side: TradeSide = rng() < 0.5 ? "LONG" : "SHORT";
    const match = findMatchingTrade(klines, outcomes[i], side, rng);
    if (!match) continue;

    trades.push({
      id: `v${GENERATION_VERSION}-${symbol}-${dayIndex}-${i}`,
      symbol,
      dayIndex,
      ...match,
    });
  }

  return trades;
}

export async function generateDayTrades(
  symbols: string[],
  dayIndex: number,
  outcomes: TradeOutcome[],
): Promise<AphaTrade[]> {
  const rng = mulberry32(hashSeed(`day:v${GENERATION_VERSION}:${dayIndex}`));
  const trades: AphaTrade[] = [];

  for (let i = 0; i < symbols.length && i < outcomes.length; i++) {
    const symbolTrades = await generateTradesForSymbolDay(
      symbols[i],
      dayIndex,
      [outcomes[i]],
      rng,
    );
    trades.push(...symbolTrades);
  }

  return trades;
}

export function computeStats(trades: AphaTrade[]): AphaStats {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      beRate: 0,
      slRate: 0,
      profitRate: 0,
      avgPnlPct: 0,
      totalPnlUsdt: 0,
      avgLeverage: 0,
      startingCapitalUsdt: STARTING_CAPITAL_USDT,
      roiPct: 0,
    };
  }

  const wins = trades.filter((t) => t.outcome !== "sl").length;
  const be = trades.filter((t) => t.outcome === "be").length;
  const sl = trades.filter((t) => t.outcome === "sl").length;
  const profit = trades.filter((t) => t.outcome === "profit").length;
  const totalPnlUsdt = trades.reduce((s, t) => s + t.pnlUsdt, 0);

  return {
    totalTrades: trades.length,
    winRate: (wins / trades.length) * 100,
    beRate: (be / trades.length) * 100,
    slRate: (sl / trades.length) * 100,
    profitRate: (profit / trades.length) * 100,
    avgPnlPct: trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length,
    totalPnlUsdt,
    avgLeverage: trades.reduce((s, t) => s + t.leverage, 0) / trades.length,
    startingCapitalUsdt: STARTING_CAPITAL_USDT,
    roiPct: (totalPnlUsdt / STARTING_CAPITAL_USDT) * 100,
  };
}

export async function generateTrackRecord(opts?: {
  symbol?: string;
  now?: number;
}): Promise<{ trades: AphaTrade[]; stats: AphaStats; symbols: string[] }> {
  const now = opts?.now ?? Date.now();
  const allSymbols = (await getPerpSymbols()).map((s) => s.symbol);
  const days = getCompletedDayIndices(now);
  const pool = buildOutcomePool();
  const trades: AphaTrade[] = [];

  for (const dayIndex of days) {
    const { symbols } = planDay(allSymbols, dayIndex);
    const outcomeStart = getGlobalOutcomeIndexForDay(dayIndex);
    const dayOutcomes = pool.slice(outcomeStart, outcomeStart + symbols.length);
    const dayTrades = await generateDayTrades(symbols, dayIndex, dayOutcomes);

    if (opts?.symbol) {
      trades.push(...dayTrades.filter((t) => t.symbol === opts.symbol));
    } else {
      trades.push(...dayTrades);
    }
  }

  trades.sort((a, b) => b.exitTime - a.exitTime);
  return {
    trades,
    stats: computeStats(trades),
    symbols: allSymbols,
  };
}
