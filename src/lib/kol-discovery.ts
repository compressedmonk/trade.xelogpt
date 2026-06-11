import { getKols, getSmartMoney } from "@/lib/gmgn-client";
import { normalizeTwitterUsername } from "@/lib/mention-parser";
import { SOLANA_KOL_SEED, type KolCategory, type SeedKol } from "@/lib/solana-kol-seed";
import {
  SOLANA_KOL_WALLET_SEED,
  type WalletSeedKol,
} from "@/lib/solana-kol-wallet-seed";

export type KolSource = "seed" | "wallet_seed" | "gmgn_kol" | "gmgn_smartmoney";

export interface GmgnTrade {
  maker?: string;
  timestamp?: number;
  maker_info?: {
    twitter_username?: string;
    name?: string;
    tags?: string[];
  };
}

export interface RawDiscoveredKol {
  twitterUsername: string;
  displayName: string | null;
  category: KolCategory | null;
  approxFollowers: number | null;
  notes: string | null;
  sources: KolSource[];
  walletAddress: string | null;
  lastSeenTrade: number | null;
}

function parseTradeList(raw: unknown): GmgnTrade[] {
  if (Array.isArray(raw)) return raw as GmgnTrade[];
  const obj = raw as { list?: GmgnTrade[] };
  return obj.list ?? [];
}

function isKolTagged(tags?: string[]): boolean {
  if (!tags?.length) return false;
  return tags.some((t) => t === "kol" || t === "renowned");
}

function ingestTrade(
  map: Map<string, RawDiscoveredKol>,
  trade: GmgnTrade,
  source: KolSource,
  requireKolTag: boolean,
) {
  const handle = trade.maker_info?.twitter_username;
  if (!handle || !trade.maker) return;
  if (requireKolTag && !isKolTagged(trade.maker_info?.tags)) return;

  const key = normalizeTwitterUsername(handle);
  const existing = map.get(key);
  const ts = trade.timestamp ?? null;

  if (existing) {
    if (!existing.sources.includes(source)) existing.sources.push(source);
    if (!existing.walletAddress) existing.walletAddress = trade.maker;
    if (!existing.displayName && trade.maker_info?.name) {
      existing.displayName = trade.maker_info.name;
    }
    if (ts && (!existing.lastSeenTrade || ts > existing.lastSeenTrade)) {
      existing.lastSeenTrade = ts;
    }
    return;
  }

  map.set(key, {
    twitterUsername: key,
    displayName: trade.maker_info?.name ?? null,
    category: null,
    approxFollowers: null,
    notes: null,
    sources: [source],
    walletAddress: trade.maker,
    lastSeenTrade: ts,
  });
}

function ingestWalletSeed(map: Map<string, RawDiscoveredKol>, entry: WalletSeedKol) {
  const key = normalizeTwitterUsername(entry.twitterUsername);
  const existing = map.get(key);

  if (existing) {
    if (!existing.sources.includes("wallet_seed")) existing.sources.push("wallet_seed");
    existing.displayName = existing.displayName ?? entry.displayName;
    existing.category = existing.category ?? "trader";
    existing.walletAddress = existing.walletAddress ?? entry.walletAddress;
    existing.notes = existing.notes ?? `Wallet: ${entry.displayName}`;
    return;
  }

  map.set(key, {
    twitterUsername: key,
    displayName: entry.displayName,
    category: "trader",
    approxFollowers: null,
    notes: `Wallet: ${entry.displayName}`,
    sources: ["wallet_seed"],
    walletAddress: entry.walletAddress,
    lastSeenTrade: null,
  });
}

function ingestSeed(map: Map<string, RawDiscoveredKol>, seed: SeedKol) {
  const key = normalizeTwitterUsername(seed.twitterUsername);
  const existing = map.get(key);

  if (existing) {
    if (!existing.sources.includes("seed")) existing.sources.push("seed");
    existing.displayName = existing.displayName ?? seed.displayName;
    existing.category = existing.category ?? seed.category;
    existing.approxFollowers = existing.approxFollowers ?? seed.approxFollowers;
    existing.notes = existing.notes ?? seed.notes ?? null;
    return;
  }

  map.set(key, {
    twitterUsername: key,
    displayName: seed.displayName,
    category: seed.category,
    approxFollowers: seed.approxFollowers,
    notes: seed.notes ?? null,
    sources: ["seed"],
    walletAddress: null,
    lastSeenTrade: null,
  });
}

export async function buildRawDiscoveryPool(): Promise<RawDiscoveredKol[]> {
  const map = new Map<string, RawDiscoveredKol>();

  for (const seed of SOLANA_KOL_SEED) {
    ingestSeed(map, seed);
  }

  for (const entry of SOLANA_KOL_WALLET_SEED) {
    ingestWalletSeed(map, entry);
  }

  const [kolData, smartData] = await Promise.all([
    getKols("sol", 200).catch(() => ({ list: [] })),
    getSmartMoney("sol", 200).catch(() => ({ list: [] })),
  ]);

  for (const trade of parseTradeList(kolData)) {
    ingestTrade(map, trade, "gmgn_kol", false);
  }

  for (const trade of parseTradeList(smartData)) {
    ingestTrade(map, trade, "gmgn_smartmoney", true);
  }

  return Array.from(map.values());
}

export function isGmgnValidated(sources: KolSource[]): boolean {
  return sources.some((s) => s === "gmgn_kol" || s === "gmgn_smartmoney");
}
