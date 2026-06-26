import { prisma } from "@/lib/prisma";
import { getCachedMetrics } from "@/lib/kol-metrics-cache";
import type { CryptoSentiment } from "@/lib/kol-sentiment-classifier";

const HALF_LIFE_HOURS = 6;
const MOMENTUM_MULTIPLIERS = { strong: 1.5, moderate: 1.0, weak: 0.7 } as const;

function sentimentScore(s: CryptoSentiment): number {
  if (s === "bullish") return 1;
  if (s === "bearish") return -1;
  return 0;
}

function momentumMultiplier(strength: string | null | undefined): number {
  if (strength === "strong") return MOMENTUM_MULTIPLIERS.strong;
  if (strength === "weak") return MOMENTUM_MULTIPLIERS.weak;
  return MOMENTUM_MULTIPLIERS.moderate;
}

function followerWeight(username: string): number {
  const cached = getCachedMetrics(username);
  const followers = cached?.followerCount ?? 10_000;
  return Math.log10(followers + 10);
}

function postWeight(
  tweetedAt: Date,
  profileWeight: number,
  username: string,
  confidence: number | null,
  momentumStrength: string | null,
): number {
  const ageHours = (Date.now() - tweetedAt.getTime()) / (1000 * 60 * 60);
  const decay = Math.exp(-ageHours / HALF_LIFE_HOURS);
  return profileWeight * followerWeight(username) * decay * (confidence ?? 0.5) * momentumMultiplier(momentumStrength);
}

interface ScoredPost {
  tweetId: string;
  tweetedAt: Date;
  twitterUsername: string;
  displayName: string | null;
  text: string;
  topicCategory: string;
  cryptoSentiment: CryptoSentiment;
  confidence: number | null;
  momentumStrength: string | null;
  reasoning: string | null;
  tokenSymbols: string[];
  tokenAddresses: string[];
  affectedAssets: string[];
  weight: number;
  score: number;
}

async function loadScoredPosts(sinceHours?: number): Promise<ScoredPost[]> {
  const since = sinceHours
    ? new Date(Date.now() - sinceHours * 60 * 60 * 1000)
    : new Date(Date.now() - 48 * 60 * 60 * 1000);

  const posts = await prisma.kolMentionCache.findMany({
    where: {
      classificationStatus: "done",
      topicCategory: { in: ["direct_crypto", "macro_market"] },
      cryptoSentiment: { not: null },
      tweetedAt: { gte: since },
    },
    include: { kolProfile: true },
    orderBy: { tweetedAt: "desc" },
  });

  return posts
    .filter((p) => p.cryptoSentiment)
    .map((p) => {
      const sentiment = p.cryptoSentiment as CryptoSentiment;
      const weight = postWeight(
        p.tweetedAt,
        p.kolProfile.sentimentWeight,
        p.kolProfile.twitterUsername,
        p.confidence,
        p.momentumStrength,
      );
      return {
        tweetId: p.tweetId,
        tweetedAt: p.tweetedAt,
        twitterUsername: p.kolProfile.twitterUsername,
        displayName: p.kolProfile.displayName,
        text: p.text,
        topicCategory: p.topicCategory ?? "",
        cryptoSentiment: sentiment,
        confidence: p.confidence,
        momentumStrength: p.momentumStrength,
        reasoning: p.reasoning,
        tokenSymbols: p.tokenSymbols ? JSON.parse(p.tokenSymbols) : [],
        tokenAddresses: p.tokenAddresses ? JSON.parse(p.tokenAddresses) : [],
        affectedAssets: p.affectedAssets ? JSON.parse(p.affectedAssets) : [],
        weight,
        score: sentimentScore(sentiment) * weight,
      };
    });
}

function weightedIndex(posts: ScoredPost[]): number {
  if (posts.length === 0) return 0;
  const totalWeight = posts.reduce((s, p) => s + p.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = posts.reduce((s, p) => s + p.score, 0);
  return Math.round((weighted / totalWeight) * 100);
}

function detectSurge(posts: ScoredPost[]): string | null {
  const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
  const recent = posts.filter(
    (p) =>
      p.tweetedAt.getTime() >= thirtyMinAgo &&
      p.cryptoSentiment === "bearish" &&
      p.momentumStrength === "strong",
  );
  const uniqueAuthors = new Set(recent.map((p) => p.twitterUsername));
  if (uniqueAuthors.size >= 3) return "risk_off";
  if (recent.length >= 2) return "bearish_surge";
  return null;
}

export interface MacroSentimentResult {
  index: number;
  label: "bullish" | "neutral" | "bearish";
  momentum1h: number;
  momentum4h: number;
  momentum24h: number;
  surge: string | null;
  postCount: number;
  model: string | null;
  recentPosts: Array<{
    tweetId: string;
    twitterUsername: string;
    displayName: string | null;
    cryptoSentiment: CryptoSentiment;
    topicCategory: string;
    momentumStrength: string | null;
    reasoning: string | null;
    text: string;
    tweetedAt: string;
  }>;
}

function indexLabel(index: number): "bullish" | "neutral" | "bearish" {
  if (index >= 25) return "bullish";
  if (index <= -25) return "bearish";
  return "neutral";
}

export async function computeMacroSentiment(): Promise<MacroSentimentResult> {
  const all48h = await loadScoredPosts(48);
  const index = weightedIndex(all48h);

  const now = Date.now();
  const index1hAgo = weightedIndex(all48h.filter((p) => p.tweetedAt.getTime() <= now - 60 * 60 * 1000));
  const index4hAgo = weightedIndex(all48h.filter((p) => p.tweetedAt.getTime() <= now - 4 * 60 * 60 * 1000));
  const index24hAgo = weightedIndex(all48h.filter((p) => p.tweetedAt.getTime() <= now - 24 * 60 * 60 * 1000));

  const recentPosts = all48h.slice(0, 15).map((p) => ({
    tweetId: p.tweetId,
    twitterUsername: p.twitterUsername,
    displayName: p.displayName,
    cryptoSentiment: p.cryptoSentiment,
    topicCategory: p.topicCategory,
    momentumStrength: p.momentumStrength,
    reasoning: p.reasoning,
    text: p.text.slice(0, 200),
    tweetedAt: p.tweetedAt.toISOString(),
  }));

  const latestModel = await prisma.kolMentionCache.findFirst({
    where: { classificationModel: { not: null } },
    orderBy: { classifiedAt: "desc" },
    select: { classificationModel: true },
  });

  return {
    index,
    label: indexLabel(index),
    momentum1h: index - index1hAgo,
    momentum4h: index - index4hAgo,
    momentum24h: index - index24hAgo,
    surge: detectSurge(all48h),
    postCount: all48h.length,
    model: latestModel?.classificationModel ?? null,
    recentPosts,
  };
}

export interface TokenSentimentResult {
  tokenAddress: string;
  index: number;
  label: "bullish" | "neutral" | "bearish";
  postCount: number;
  posts: Array<{
    tweetId: string;
    twitterUsername: string;
    cryptoSentiment: CryptoSentiment;
    reasoning: string | null;
    text: string;
    tweetedAt: string;
  }>;
}

export async function computeTokenSentiment(tokenAddress: string): Promise<TokenSentimentResult> {
  const normalized = tokenAddress.toLowerCase();
  const all48h = await loadScoredPosts(48);

  const matched = all48h.filter(
    (p) =>
      p.tokenAddresses.some((a) => a.toLowerCase() === normalized) ||
      p.affectedAssets.some((a) => a.toLowerCase() === normalized),
  );

  const index = weightedIndex(matched);

  return {
    tokenAddress,
    index,
    label: indexLabel(index),
    postCount: matched.length,
    posts: matched.slice(0, 10).map((p) => ({
      tweetId: p.tweetId,
      twitterUsername: p.twitterUsername,
      cryptoSentiment: p.cryptoSentiment,
      reasoning: p.reasoning,
      text: p.text.slice(0, 200),
      tweetedAt: p.tweetedAt.toISOString(),
    })),
  };
}
