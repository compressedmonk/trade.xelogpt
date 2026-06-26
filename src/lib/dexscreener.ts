export interface DexTokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  priceUsd: number | null;
  priceSol: number | null;
  marketCapUsd: number | null;
  pairUrl: string | null;
}

interface DexPair {
  chainId?: string;
  baseToken?: { address?: string; symbol?: string; name?: string; decimals?: number };
  priceUsd?: string;
  priceNative?: string;
  marketCap?: number;
  url?: string;
  liquidity?: { usd?: number };
}

export async function fetchDexTokens(mints: string[]): Promise<Map<string, DexTokenInfo>> {
  const out = new Map<string, DexTokenInfo>();
  if (mints.length === 0) return out;

  const unique = Array.from(new Set(mints)).slice(0, 30);
  const url = `https://api.dexscreener.com/latest/dex/tokens/${unique.join(",")}`;

  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return out;
    const data = (await res.json()) as { pairs?: DexPair[] };
    const pairs = data.pairs ?? [];

    const byMint = new Map<string, DexPair>();
    for (const p of pairs) {
      const mint = p.baseToken?.address;
      if (!mint) continue;
      const prev = byMint.get(mint);
      const liq = p.liquidity?.usd ?? 0;
      const prevLiq = prev?.liquidity?.usd ?? 0;
      if (!prev || liq > prevLiq) byMint.set(mint, p);
    }

    for (const mint of unique) {
      const p = byMint.get(mint);
      if (!p?.baseToken) {
        out.set(mint, {
          mint,
          symbol: mint.slice(0, 6),
          name: "Unknown",
          decimals: 6,
          priceUsd: null,
          priceSol: null,
          marketCapUsd: null,
          pairUrl: null,
        });
        continue;
      }
      out.set(mint, {
        mint,
        symbol: p.baseToken.symbol ?? mint.slice(0, 6),
        name: p.baseToken.name ?? p.baseToken.symbol ?? "Unknown",
        decimals: p.baseToken.decimals ?? 6,
        priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
        priceSol: p.priceNative ? Number(p.priceNative) : null,
        marketCapUsd: p.marketCap ?? null,
        pairUrl: p.url ?? null,
      });
    }
  } catch {
    // DexScreener optional — dashboard still works without prices
  }

  return out;
}

export function rawToUi(amountRaw: string, decimals: number): number {
  const n = Number(amountRaw);
  if (!Number.isFinite(n)) return 0;
  return n / Math.pow(10, decimals);
}
