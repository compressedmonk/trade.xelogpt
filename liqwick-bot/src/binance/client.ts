import { createHmac } from "node:crypto";
import { config } from "../config.js";

export interface BinanceOrderResult {
  orderId: number;
  symbol: string;
  status: string;
  price: string;
  origQty: string;
  side: string;
  type: string;
  avgPrice?: string;
}

export interface ExchangeInfoSymbol {
  symbol: string;
  filters: Array<{ filterType: string; stepSize?: string; tickSize?: string; minQty?: string }>;
}

export interface KlineBar {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number;
  tradeCount?: number;
  takerBuyQuoteVolume?: number;
  closeTime: number;
  closed: boolean;
}

export class BinanceFuturesClient {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor() {
    this.baseUrl = config.binanceTestnet
      ? "https://testnet.binancefuture.com"
      : "https://fapi.binance.com";
    this.apiKey = config.binanceApiKey;
    this.apiSecret = config.binanceApiSecret;
  }

  get wsBaseUrl(): string {
    return config.binanceTestnet
      ? "wss://stream.binancefuture.com"
      : "wss://fstream.binance.com/market";
  }

  private sign(query: string): string {
    return createHmac("sha256", this.apiSecret).update(query).digest("hex");
  }

  private async request<T>(
    method: string,
    path: string,
    params: Record<string, string | number> = {},
    signed = false,
  ): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      qs.set(k, String(v));
    }
    if (signed) {
      qs.set("timestamp", String(Date.now()));
      qs.set("signature", this.sign(qs.toString()));
    }

    const url = `${this.baseUrl}${path}?${qs.toString()}`;
    const headers: Record<string, string> = {};
    if (this.apiKey) headers["X-MBX-APIKEY"] = this.apiKey;

    const res = await fetch(url, { method, headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Binance ${method} ${path} failed: ${res.status} ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async getKlines(symbol: string, interval: string, limit = 250): Promise<KlineBar[]> {
    const raw = await this.request<
      Array<[number, string, string, string, string, string, number, string, number, string, string, string]>
    >("GET", "/fapi/v1/klines", { symbol, interval, limit });

    return raw.map((k) => {
      const closeTime = k[6];
      return {
        openTime: k[0],
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
        closeTime,
        quoteVolume: Number(k[7]),
        tradeCount: Number(k[8]),
        takerBuyQuoteVolume: Number(k[10]),
        closed: closeTime < Date.now(),
      };
    });
  }

  async getPremiumIndex(symbol: string): Promise<{
    markPrice: number;
    indexPrice: number;
    fundingRate: number;
    nextFundingTime: number;
  }> {
    const data = await this.request<{
      markPrice: string;
      indexPrice: string;
      lastFundingRate: string;
      nextFundingTime: number;
    }>("GET", "/fapi/v1/premiumIndex", { symbol });
    return {
      markPrice: Number(data.markPrice),
      indexPrice: Number(data.indexPrice),
      fundingRate: Number(data.lastFundingRate),
      nextFundingTime: data.nextFundingTime,
    };
  }

  async getBalanceUsdt(): Promise<number> {
    if (!this.apiKey || !this.apiSecret) return config.defaultBalanceUsdt;
    const data = await this.request<{ assets: Array<{ asset: string; availableBalance: string }> }>(
      "GET",
      "/fapi/v2/balance",
      {},
      true,
    );
    const usdt = data.assets?.find((a) => a.asset === "USDT");
    return usdt ? Number(usdt.availableBalance) : config.defaultBalanceUsdt;
  }

  async getExchangeInfo(symbol: string): Promise<ExchangeInfoSymbol | null> {
    const data = await this.request<{ symbols: ExchangeInfoSymbol[] }>(
      "GET",
      "/fapi/v1/exchangeInfo",
    );
    return data.symbols.find((s) => s.symbol === symbol) ?? null;
  }

  async placeMarketOrder(params: {
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    reduceOnly?: boolean;
  }): Promise<BinanceOrderResult> {
    return this.request<BinanceOrderResult>("POST", "/fapi/v1/order", {
      symbol: params.symbol,
      side: params.side,
      type: "MARKET",
      quantity: params.quantity,
      reduceOnly: params.reduceOnly ? "true" : "false",
    }, true);
  }

  async placeStopMarket(params: {
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    stopPrice: number;
    reduceOnly?: boolean;
  }): Promise<BinanceOrderResult> {
    return this.request<BinanceOrderResult>("POST", "/fapi/v1/order", {
      symbol: params.symbol,
      side: params.side,
      type: "STOP_MARKET",
      stopPrice: params.stopPrice,
      quantity: params.quantity,
      reduceOnly: params.reduceOnly ? "true" : "false",
    }, true);
  }

  async placeTakeProfitMarket(params: {
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    stopPrice: number;
    reduceOnly?: boolean;
  }): Promise<BinanceOrderResult> {
    return this.request<BinanceOrderResult>("POST", "/fapi/v1/order", {
      symbol: params.symbol,
      side: params.side,
      type: "TAKE_PROFIT_MARKET",
      stopPrice: params.stopPrice,
      quantity: params.quantity,
      reduceOnly: params.reduceOnly ? "true" : "false",
    }, true);
  }

  async cancelOrder(symbol: string, orderId: string | number): Promise<void> {
    await this.request("DELETE", "/fapi/v1/order", { symbol, orderId }, true);
  }

  async getOrder(symbol: string, orderId: string | number): Promise<BinanceOrderResult> {
    return this.request<BinanceOrderResult>("GET", "/fapi/v1/order", { symbol, orderId }, true);
  }

  async getMarkPrice(symbol: string): Promise<number> {
    const data = await this.request<{ markPrice: string }>("GET", "/fapi/v1/premiumIndex", { symbol });
    return Number(data.markPrice);
  }

  resolveSymbolFilters(info: ExchangeInfoSymbol | null): {
    stepSize: number;
    tickSize: number;
    minQty: number;
  } {
    const lot = info?.filters.find((f) => f.filterType === "LOT_SIZE");
    const price = info?.filters.find((f) => f.filterType === "PRICE_FILTER");
    return {
      stepSize: lot?.stepSize ? Number(lot.stepSize) : 0.001,
      tickSize: price?.tickSize ? Number(price.tickSize) : 0.01,
      minQty: lot?.minQty ? Number(lot.minQty) : 0.001,
    };
  }
}
