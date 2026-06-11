import type { TokenRank } from "@/lib/gmgn-client";

export function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

export function mapInfoToTokenRank(
  info: Record<string, unknown>,
  security: Record<string, unknown> | null,
  address: string,
): TokenRank {
  const stat = (info.stat ?? {}) as Record<string, unknown>;
  const priceRaw = info.price;
  const priceNum =
    typeof priceRaw === "object" && priceRaw !== null
      ? parseFloat(String((priceRaw as Record<string, unknown>).price ?? "0"))
      : Number(priceRaw ?? 0);
  const supply = parseFloat(String(info.circulating_supply ?? info.total_supply ?? "0"));

  return {
    address,
    symbol: String(info.symbol ?? "?"),
    name: String(info.name ?? ""),
    logo: String(info.logo ?? ""),
    price: priceNum,
    price_change_percent: Number(stat.price_change_percent ?? 0),
    price_change_percent1m: Number(stat.price_change_percent1m ?? 0),
    price_change_percent5m: Number(stat.price_change_percent5m ?? 0),
    price_change_percent1h: Number(stat.price_change_percent1h ?? 0),
    volume: Number(stat.volume_1h ?? stat.volume ?? 0),
    liquidity: parseFloat(String(info.liquidity ?? "0")),
    market_cap: priceNum * supply,
    total_supply: supply,
    swaps: Number(stat.swaps_1h ?? stat.swaps ?? 0),
    buys: Number(stat.buys_1h ?? stat.buys ?? 0),
    sells: Number(stat.sells_1h ?? stat.sells ?? 0),
    holder_count: Number(info.holder_count ?? 0),
    hot_level: Number(info.hot_level ?? 0),
    creation_timestamp: Number(info.creation_timestamp ?? 0),
    open_timestamp: Number(info.open_timestamp ?? 0),
    launchpad_platform: String(info.launchpad_platform ?? ""),
    exchange: String(info.exchange ?? ""),
    twitter_username: String((info.link as Record<string, unknown> | undefined)?.twitter_username ?? ""),
    website: String((info.link as Record<string, unknown> | undefined)?.website ?? ""),
    telegram: String((info.link as Record<string, unknown> | undefined)?.telegram ?? ""),
    renounced_mint: security?.renounced_mint ? 1 : 0,
    renounced_freeze_account: security?.renounced_freeze_account ? 1 : 0,
    burn_status: String(security?.burn_status ?? ""),
    creator_token_status: String(security?.creator_token_status ?? ""),
    creator_close: Boolean(security?.creator_close),
    is_wash_trading: Boolean(security?.is_wash_trading),
    rug_ratio: parseFloat(String(security?.rug_ratio ?? "0")),
    smart_degen_count: Number((info.wallet_tags_stat as Record<string, unknown> | undefined)?.smart_wallets ?? 0),
    renowned_count: 0,
    top_10_holder_rate: parseFloat(String(security?.top_10_holder_rate ?? "0")),
    bundler_rate: parseFloat(String(security?.bundler_rate ?? "0")),
    rat_trader_amount_rate: parseFloat(String(security?.rat_trader_amount_rate ?? "0")),
    sniper_count: Number(security?.sniper_count ?? 0),
    cto_flag: Number(info.cto_flag ?? 0),
    is_honeypot: security?.is_honeypot ? 1 : 0,
  };
}
