import { prisma } from "@/lib/prisma";
import { getTokenInfo, getTokenSecurity, getTrending, type TokenRank } from "@/lib/gmgn-client";
import { syncKolMentions } from "@/lib/kol-feed";
import { isValidSolanaAddress, mapInfoToTokenRank } from "@/lib/token-map";

export interface KolTokenRow {
  token: TokenRank;
  myKolCount: number;
  myKols: string[];
  lastMentionAt: number;
}

export async function buildKolMentionedTokens(): Promise<KolTokenRow[]> {
  await syncKolMentions();

  const mentions = await prisma.kolMentionCache.findMany({
    include: { kolProfile: true },
    orderBy: { tweetedAt: "desc" },
  });

  const byAddress = new Map<string, { address: string; kols: Set<string>; lastMentionAt: number }>();

  for (const mention of mentions) {
    let addresses: string[] = [];
    try {
      addresses = JSON.parse(mention.tokenAddresses ?? "[]");
    } catch {
      addresses = [];
    }

    for (const raw of addresses) {
      const address = raw.trim();
      if (!isValidSolanaAddress(address)) continue;

      const key = address.toLowerCase();
      const ts = Math.floor(mention.tweetedAt.getTime() / 1000);
      const entry = byAddress.get(key) ?? { address, kols: new Set<string>(), lastMentionAt: 0 };
      entry.kols.add(mention.kolProfile.twitterUsername);
      entry.lastMentionAt = Math.max(entry.lastMentionAt, ts);
      byAddress.set(key, entry);
    }
  }

  if (byAddress.size === 0) return [];

  const trending = await getTrending("sol", "1h", { limit: 100 }).catch(() => ({ rank: [] }));
  const trendingMap = new Map(trending.rank.map((t) => [t.address.toLowerCase(), t]));

  const rows: KolTokenRow[] = [];

  for (const [key, meta] of Array.from(byAddress.entries())) {
    const address = meta.address;

    let token = trendingMap.get(key);
    if (!token) {
      const [info, security] = await Promise.all([
        getTokenInfo("sol", address).catch(() => null),
        getTokenSecurity("sol", address).catch(() => null),
      ]);
      if (info && typeof info === "object") {
        token = mapInfoToTokenRank(
          info as Record<string, unknown>,
          security as Record<string, unknown> | null,
          address,
        );
      }
    }

    if (!token) continue;

    rows.push({
      token,
      myKolCount: meta.kols.size,
      myKols: Array.from(meta.kols),
      lastMentionAt: meta.lastMentionAt,
    });
  }

  return rows.sort((a, b) => {
    if (b.myKolCount !== a.myKolCount) return b.myKolCount - a.myKolCount;
    return b.lastMentionAt - a.lastMentionAt;
  });
}
