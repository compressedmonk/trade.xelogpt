const FAPI_BASE = "https://fapi.binance.com";

export interface AphaKlineBar {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface AphaSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
}

let symbolsCache: { at: number; data: AphaSymbol[] } | null = null;
const SYMBOLS_TTL_MS = 60 * 60 * 1000;

const klineCache = new Map<string, { at: number; data: AphaKlineBar[] }>();
const KLINE_TTL_MS = 30 * 60 * 1000;

export async function getPerpSymbols(): Promise<AphaSymbol[]> {
  if (symbolsCache && Date.now() - symbolsCache.at < SYMBOLS_TTL_MS) {
    return symbolsCache.data;
  }

  const res = await fetch(`${FAPI_BASE}/fapi/v1/exchangeInfo`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Binance exchangeInfo failed: ${res.status}`);

  const data = (await res.json()) as {
    symbols: Array<{
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
      status: string;
      contractType: string;
    }>;
  };

  const symbols = data.symbols
    .filter((s) => s.status === "TRADING" && s.contractType === "PERPETUAL" && s.quoteAsset === "USDT")
    .map((s) => ({ symbol: s.symbol, baseAsset: s.baseAsset, quoteAsset: s.quoteAsset }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  symbolsCache = { at: Date.now(), data: symbols };
  return symbols;
}

export async function getKlines(
  symbol: string,
  interval: string,
  startTime: number,
  endTime: number,
  limit = 500,
): Promise<AphaKlineBar[]> {
  const cacheKey = `${symbol}:${interval}:${startTime}:${endTime}`;
  const cached = klineCache.get(cacheKey);
  if (cached && Date.now() - cached.at < KLINE_TTL_MS) {
    return cached.data;
  }

  const qs = new URLSearchParams({
    symbol,
    interval,
    startTime: String(startTime),
    endTime: String(endTime),
    limit: String(limit),
  });

  const res = await fetch(`${FAPI_BASE}/fapi/v1/klines?${qs}`, {
    next: { revalidate: 1800 },
  });
  if (!res.ok) throw new Error(`Binance klines failed for ${symbol}: ${res.status}`);

  const raw = (await res.json()) as Array<[number, string, string, string, string, string, number]>;
  const bars: AphaKlineBar[] = raw.map((k) => ({
    openTime: k[0],
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: k[6],
  }));

  klineCache.set(cacheKey, { at: Date.now(), data: bars });
  return bars;
}

export function binanceFuturesUrl(symbol: string): string {
  return `https://www.binance.com/en/futures/${symbol}`;
}
