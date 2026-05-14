import crypto from "crypto";

const GMGN_HOST = "https://openapi.gmgn.ai";
const API_KEY = process.env.GMGN_API_KEY!;

function authQuery() {
  return {
    timestamp: Math.floor(Date.now() / 1000).toString(),
    client_id: crypto.randomUUID(),
  };
}

function buildUrl(path: string, params: Record<string, string | number | undefined>) {
  const url = new URL(`${GMGN_HOST}${path}`);
  const auth = authQuery();
  url.searchParams.set("timestamp", auth.timestamp);
  url.searchParams.set("client_id", auth.client_id);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function unwrapData(raw: unknown): unknown {
  const obj = raw as Record<string, unknown>;
  if (obj && typeof obj === "object" && "code" in obj && "data" in obj && obj.code === 0) {
    return obj.data;
  }
  return obj;
}

async function gmgnGet<T = unknown>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = buildUrl(path, params);
  const res = await fetch(url, {
    headers: { "X-APIKEY": API_KEY, "Content-Type": "application/json" },
    next: { revalidate: 30 },
  });
  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`GMGN API error: ${json.error ?? json.message ?? JSON.stringify(json)}`);
  }
  return unwrapData(json.data) as T;
}

async function gmgnPost<T = unknown>(path: string, params: Record<string, string | number | undefined>, body: unknown): Promise<T> {
  const url = buildUrl(path, params);
  const res = await fetch(url, {
    method: "POST",
    headers: { "X-APIKEY": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`GMGN API error: ${json.error ?? json.message ?? JSON.stringify(json)}`);
  }
  return unwrapData(json.data) as T;
}

// ---- Token endpoints ----

export async function getTokenInfo(chain: string, address: string) {
  return gmgnGet("/v1/token/info", { chain, address });
}

export async function getTokenSecurity(chain: string, address: string) {
  return gmgnGet("/v1/token/security", { chain, address });
}

export async function getTokenPool(chain: string, address: string) {
  return gmgnGet("/v1/token/pool_info", { chain, address });
}

export async function getTokenHolders(chain: string, address: string, opts: {
  limit?: number; order_by?: string; direction?: string; tag?: string;
} = {}) {
  return gmgnGet("/v1/market/token_top_holders", { chain, address, ...opts });
}

export async function getTokenTraders(chain: string, address: string, opts: {
  limit?: number; order_by?: string; direction?: string; tag?: string;
} = {}) {
  return gmgnGet("/v1/market/token_top_traders", { chain, address, ...opts });
}

// ---- Market endpoints ----

export async function getTrending(chain: string, interval: string, opts: {
  limit?: number; order_by?: string; direction?: string;
} = {}) {
  return gmgnGet<{ rank: TokenRank[] }>("/v1/market/rank", { chain, interval, ...opts });
}

export async function getKline(chain: string, address: string, resolution: string = "15m") {
  return gmgnGet<{ list: KlineBar[] }>("/v1/market/token_kline", { chain, address, resolution });
}

export interface KlineBar {
  time: number;
  open: string;
  close: string;
  high: string;
  low: string;
  volume: string;
}

export async function getTrenches(chain: string, types?: string[], limit?: number) {
  const PLATFORMS: Record<string, string[]> = {
    sol: ["Pump.fun", "pump_mayhem", "pump_mayhem_agent", "pump_agent", "letsbonk", "bonkers", "bags", "boop", "ray_launchpad", "meteora_virtual_curve", "believe", "surge"],
    bsc: ["fourmeme", "fourmeme_agent", "bn_fourmeme", "four_xmode_agent", "flap", "clanker", "lunafun"],
    base: ["clanker", "bankr", "flaunch", "zora", "zora_creator", "baseapp", "basememe", "virtuals_v2", "klik"],
  };
  const QUOTE_TYPES: Record<string, number[]> = {
    sol: [4, 5, 3, 1, 13, 0],
    bsc: [6, 7, 1, 16, 8, 3, 9, 10, 2, 17, 18, 0],
    base: [11, 3, 12, 13, 0],
  };

  const selectedTypes = types?.length ? types : ["new_creation", "near_completion", "completed"];
  const section = {
    filters: ["offchain", "onchain"],
    launchpad_platform: PLATFORMS[chain] ?? [],
    quote_address_type: QUOTE_TYPES[chain] ?? [],
    launchpad_platform_v2: true,
    limit: limit ?? 50,
  };

  const body: Record<string, unknown> = { version: "v2" };
  for (const type of selectedTypes) {
    body[type] = { ...section };
  }

  return gmgnPost("/v1/trenches", { chain }, body);
}

export async function getTokenSignals(chain: string, groups: Array<{ signal_type?: number[]; mc_min?: number; mc_max?: number }>) {
  return gmgnPost("/v1/market/token_signal", {}, { chain, groups });
}

// ---- Wallet / Smart Money endpoints ----

export async function getSmartMoney(chain: string, limit?: number) {
  return gmgnGet("/v1/user/smartmoney", { chain, limit });
}

export async function getKols(chain: string, limit?: number) {
  return gmgnGet("/v1/user/kol", { chain, limit });
}

export async function getWalletHoldings(chain: string, walletAddress: string) {
  return gmgnGet("/v1/user/wallet_holdings", { chain, wallet_address: walletAddress });
}

export async function getWalletActivity(chain: string, walletAddress: string) {
  return gmgnGet("/v1/user/wallet_activity", { chain, wallet_address: walletAddress });
}

// ---- Types ----

export interface TokenRank {
  address: string;
  symbol: string;
  name: string;
  logo: string;
  price: number;
  price_change_percent: number;
  price_change_percent1m: number;
  price_change_percent5m: number;
  price_change_percent1h: number;
  volume: number;
  liquidity: number;
  market_cap: number;
  total_supply: number;
  swaps: number;
  buys: number;
  sells: number;
  holder_count: number;
  hot_level: number;
  creation_timestamp: number;
  open_timestamp: number;
  launchpad_platform: string;
  exchange: string;
  twitter_username: string;
  website: string;
  telegram: string;
  renounced_mint: number;
  renounced_freeze_account: number;
  burn_status: string;
  creator_token_status: string;
  creator_close: boolean;
  is_wash_trading: boolean;
  rug_ratio: number;
  smart_degen_count: number;
  renowned_count: number;
  top_10_holder_rate: number;
  bundler_rate: number;
  rat_trader_amount_rate: number;
  sniper_count: number;
  cto_flag: number;
  is_honeypot: number;
}
