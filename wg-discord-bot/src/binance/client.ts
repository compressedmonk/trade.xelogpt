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
}

export interface ExchangeInfoSymbol {
  symbol: string;
  filters: Array<{ filterType: string; stepSize?: string; tickSize?: string; minQty?: string }>;
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

  async getBalanceUsdt(): Promise<number> {
    const data = await this.request<{ assets: Array<{ asset: string; availableBalance: string }> }>(
      "GET",
      "/fapi/v2/balance",
      {},
      true,
    );
    const usdt = data.assets?.find((a) => a.asset === "USDT");
    return usdt ? Number(usdt.availableBalance) : 0;
  }

  async getExchangeInfo(symbol: string): Promise<ExchangeInfoSymbol | null> {
    const data = await this.request<{ symbols: ExchangeInfoSymbol[] }>(
      "GET",
      "/fapi/v1/exchangeInfo",
    );
    return data.symbols.find((s) => s.symbol === symbol) ?? null;
  }

  async placeLimitOrder(params: {
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    price: number;
    reduceOnly?: boolean;
  }): Promise<BinanceOrderResult> {
    return this.request<BinanceOrderResult>("POST", "/fapi/v1/order", {
      symbol: params.symbol,
      side: params.side,
      type: "LIMIT",
      timeInForce: "GTC",
      quantity: params.quantity,
      price: params.price,
      reduceOnly: params.reduceOnly ? "true" : "false",
    }, true);
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

  async cancelOrder(symbol: string, orderId: string | number): Promise<void> {
    await this.request("DELETE", "/fapi/v1/order", { symbol, orderId }, true);
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

export function resolveSymbol(asset: string): string {
  return `${asset.toUpperCase()}USDT`;
}
