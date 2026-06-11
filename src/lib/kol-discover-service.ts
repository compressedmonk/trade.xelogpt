import {
  buildRawDiscoveryPool,
  isGmgnValidated,
  type KolSource,
  type RawDiscoveredKol,
} from "@/lib/kol-discovery";
import { getCachedMetrics, getMissingUsernames, setCachedMetrics } from "@/lib/kol-metrics-cache";
import { normalizeTwitterUsername } from "@/lib/mention-parser";
import type { KolCategory } from "@/lib/solana-kol-seed";
import { lookupUsersByUsernames } from "@/lib/twitter-client";
import { prisma } from "@/lib/prisma";

export interface DiscoveredKol {
  twitterUsername: string;
  displayName: string | null;
  category: KolCategory | null;
  followerCount: number | null;
  followerSource: "live" | "approx" | null;
  notes: string | null;
  sources: KolSource[];
  walletAddress: string | null;
  lastSeenTrade: number | null;
  alreadyAdded: boolean;
}

export interface DiscoverFilters {
  category?: KolCategory | null;
  minFollowers?: number;
  gmgnOnly?: boolean;
  walletSeedOnly?: boolean;
}

async function enrichWithMetrics(pool: RawDiscoveredKol[]): Promise<DiscoveredKol[]> {
  const handles = pool.map((k) => k.twitterUsername);
  const missing = getMissingUsernames(handles);

  if (missing.length > 0) {
    const live = await lookupUsersByUsernames(missing);
    for (const user of live) {
      setCachedMetrics(user.username, user.followerCount, user.name);
    }
  }

  const added = new Set(
    (await prisma.kolProfile.findMany({ select: { twitterUsername: true } })).map((p) =>
      normalizeTwitterUsername(p.twitterUsername),
    ),
  );

  return pool.map((kol) => {
    const cached = getCachedMetrics(kol.twitterUsername);
    let followerCount: number | null = null;
    let followerSource: DiscoveredKol["followerSource"] = null;
    let displayName = kol.displayName;

    if (cached) {
      followerCount = cached.followerCount;
      followerSource = "live";
      displayName = displayName ?? cached.displayName;
    } else if (kol.approxFollowers != null) {
      followerCount = kol.approxFollowers;
      followerSource = "approx";
    }

    return {
      twitterUsername: kol.twitterUsername,
      displayName,
      category: kol.category,
      followerCount,
      followerSource,
      notes: kol.notes,
      sources: kol.sources,
      walletAddress: kol.walletAddress,
      lastSeenTrade: kol.lastSeenTrade,
      alreadyAdded: added.has(kol.twitterUsername),
    };
  });
}

export async function discoverKols(filters: DiscoverFilters = {}): Promise<{
  kols: DiscoveredKol[];
  poolSize: number;
  lastRefreshed: string;
}> {
  const pool = await buildRawDiscoveryPool();
  let kols = await enrichWithMetrics(pool);

  if (filters.category) {
    kols = kols.filter((k) => k.category === filters.category);
  }

  if (filters.gmgnOnly) {
    kols = kols.filter((k) => isGmgnValidated(k.sources));
  }

  if (filters.walletSeedOnly) {
    kols = kols.filter((k) => k.sources.includes("wallet_seed"));
  }

  if (filters.minFollowers != null && filters.minFollowers > 0) {
    kols = kols.filter((k) => (k.followerCount ?? 0) >= filters.minFollowers!);
  }

  kols.sort((a, b) => {
    const fa = a.followerCount ?? 0;
    const fb = b.followerCount ?? 0;
    if (fb !== fa) return fb - fa;
    return a.twitterUsername.localeCompare(b.twitterUsername);
  });

  return {
    kols,
    poolSize: pool.length,
    lastRefreshed: new Date().toISOString(),
  };
}
