import { prisma } from "@/lib/prisma";
import { getWalletActivity } from "@/lib/gmgn-client";
import { fetchUserTweets, lookupUserByUsername } from "@/lib/twitter-client";
import { hasTokenMention, normalizeTwitterUsername, parseMentionsFromText } from "@/lib/mention-parser";

export interface KolFeedItem {
  id: string;
  type: "mention" | "buy" | "sell";
  timestamp: number;
  twitterUsername: string;
  displayName: string | null;
  walletAddress?: string;
  walletLabel?: string | null;
  tokenAddress?: string;
  tokenSymbol?: string;
  amountUsd?: number;
  detail?: string;
  cluster: boolean;
  clusterCount?: number;
}

interface WalletTrade {
  side?: string;
  amount_usd?: number;
  timestamp?: number;
  base_address?: string;
  base_token?: { symbol?: string };
}

const CLUSTER_WINDOW_SEC = 30 * 60;

function parseActivityList(raw: unknown): WalletTrade[] {
  if (Array.isArray(raw)) return raw as WalletTrade[];
  const obj = raw as { list?: WalletTrade[]; activities?: WalletTrade[] };
  return obj.list ?? obj.activities ?? [];
}

export async function syncKolMentions(): Promise<void> {
  if (!process.env.TWITTER_BEARER_TOKEN) return;

  const profiles = await prisma.kolProfile.findMany({ where: { enabled: true } });

  for (const profile of profiles) {
    try {
      let userId = profile.twitterUserId;
      if (!userId) {
        const user = await lookupUserByUsername(profile.twitterUsername);
        if (!user) continue;
        userId = user.id;
        await prisma.kolProfile.update({
          where: { id: profile.id },
          data: { twitterUserId: userId, displayName: user.name },
        });
      }

      const latest = await prisma.kolMentionCache.findFirst({
        where: { kolProfileId: profile.id },
        orderBy: { tweetedAt: "desc" },
      });
      const sinceId = latest?.tweetId;

      const tweets = await fetchUserTweets(userId, { sinceId, maxResults: 10 });

      for (const tweet of tweets) {
        const parsed = parseMentionsFromText(tweet.text);
        if (!hasTokenMention(parsed)) continue;

        await prisma.kolMentionCache.upsert({
          where: { tweetId: tweet.id },
          update: {},
          create: {
            tweetId: tweet.id,
            kolProfileId: profile.id,
            text: tweet.text,
            tokenSymbols: JSON.stringify(parsed.tokenSymbols),
            tokenAddresses: JSON.stringify(parsed.tokenAddresses),
            tweetedAt: new Date(tweet.created_at ?? Date.now()),
          },
        });
      }
    } catch {
      // skip failed profile
    }
  }
}

function applyClusterFlags(items: KolFeedItem[]): KolFeedItem[] {
  const buys = items.filter((i) => i.type === "buy" && i.tokenAddress);

  return items.map((item) => {
    if (item.type !== "buy" || !item.tokenAddress) return item;

    const peers = buys.filter(
      (b) =>
        b.tokenAddress === item.tokenAddress &&
        Math.abs(b.timestamp - item.timestamp) <= CLUSTER_WINDOW_SEC,
    );
    const uniqueWallets = new Set(peers.map((p) => p.walletAddress).filter(Boolean));
    const uniqueKols = new Set(peers.map((p) => p.twitterUsername));

    const cluster = uniqueWallets.size >= 2 || uniqueKols.size >= 2;
    return {
      ...item,
      cluster,
      clusterCount: cluster ? Math.max(uniqueWallets.size, uniqueKols.size) : undefined,
    };
  });
}

export async function buildKolFeed(limit = 50): Promise<KolFeedItem[]> {
  await syncKolMentions();

  const profiles = await prisma.kolProfile.findMany({
    where: { enabled: true },
    include: { wallets: true, mentions: { orderBy: { tweetedAt: "desc" }, take: 20 } },
  });

  const items: KolFeedItem[] = [];

  for (const profile of profiles) {
    for (const mention of profile.mentions) {
      const symbols: string[] = mention.tokenSymbols ? JSON.parse(mention.tokenSymbols) : [];
      const addresses: string[] = mention.tokenAddresses ? JSON.parse(mention.tokenAddresses) : [];

      items.push({
        id: `mention-${mention.tweetId}`,
        type: "mention",
        timestamp: Math.floor(mention.tweetedAt.getTime() / 1000),
        twitterUsername: profile.twitterUsername,
        displayName: profile.displayName,
        tokenAddress: addresses[0],
        tokenSymbol: symbols[0],
        detail: mention.text.slice(0, 120),
        cluster: false,
      });
    }

    for (const wallet of profile.wallets) {
      try {
        const raw = await getWalletActivity(wallet.chain, wallet.walletAddress);
        const trades = parseActivityList(raw).slice(0, 15);

        for (const trade of trades) {
          const side = (trade.side ?? "").toLowerCase();
          if (side !== "buy" && side !== "sell") continue;

          items.push({
            id: `trade-${wallet.walletAddress}-${trade.timestamp}-${trade.base_address}`,
            type: side as "buy" | "sell",
            timestamp: trade.timestamp ?? 0,
            twitterUsername: profile.twitterUsername,
            displayName: profile.displayName,
            walletAddress: wallet.walletAddress,
            walletLabel: wallet.label,
            tokenAddress: trade.base_address,
            tokenSymbol: trade.base_token?.symbol,
            amountUsd: trade.amount_usd,
            cluster: false,
          });
        }
      } catch {
        // skip wallet
      }
    }
  }

  return applyClusterFlags(
    items.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit),
  );
}

export async function getOwnKolsOnToken(tokenAddress: string) {
  const normalized = tokenAddress.toLowerCase();
  const profiles = await prisma.kolProfile.findMany({
    where: { enabled: true },
    include: { wallets: true, mentions: true },
  });

  const traders: Array<{
    twitterUsername: string;
    displayName: string | null;
    walletAddress?: string;
    type: "mention" | "trade";
    detail?: string;
  }> = [];

  for (const profile of profiles) {
    for (const mention of profile.mentions) {
      const addresses: string[] = mention.tokenAddresses ? JSON.parse(mention.tokenAddresses) : [];
      if (addresses.some((a) => a.toLowerCase() === normalized)) {
        traders.push({
          twitterUsername: profile.twitterUsername,
          displayName: profile.displayName,
          type: "mention",
          detail: mention.text.slice(0, 80),
        });
      }
    }

    for (const wallet of profile.wallets) {
      try {
        const raw = await getWalletActivity(wallet.chain, wallet.walletAddress);
        const trades = parseActivityList(raw);
        const hit = trades.find((t) => t.base_address?.toLowerCase() === normalized);
        if (hit) {
          traders.push({
            twitterUsername: profile.twitterUsername,
            displayName: profile.displayName,
            walletAddress: wallet.walletAddress,
            type: "trade",
            detail: `${(hit.side ?? "").toUpperCase()} $${(hit.amount_usd ?? 0).toFixed(0)}`,
          });
        }
      } catch {
        // skip
      }
    }
  }

  return traders;
}

export { normalizeTwitterUsername };
