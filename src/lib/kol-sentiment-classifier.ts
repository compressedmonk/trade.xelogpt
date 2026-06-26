import OpenAI from "openai";

export type TopicCategory = "direct_crypto" | "macro_market" | "off_topic";
export type CryptoSentiment = "bullish" | "neutral" | "bearish";
export type MomentumStrength = "weak" | "moderate" | "strong";

export interface ClassificationResult {
  topicCategory: TopicCategory;
  cryptoSentiment: CryptoSentiment | null;
  confidence: number;
  momentumStrength: MomentumStrength | null;
  reasoning: string;
  affectedAssets: string[];
}

const SYSTEM_PROMPT = `You classify X (Twitter) posts for crypto market impact.

Output JSON only with these fields:
- topicCategory: "direct_crypto" | "macro_market" | "off_topic"
- cryptoSentiment: "bullish" | "neutral" | "bearish" | null
- confidence: number 0-1
- momentumStrength: "weak" | "moderate" | "strong" | null
- reasoning: string max 200 chars, plain language
- affectedAssets: string[] e.g. ["BTC","SOL","general_crypto"]

Rules:
1. The question is NOT "is this a good tweet" but "what does this imply for crypto markets?"
2. direct_crypto: mentions BTC, ETH, SOL, DeFi, tokens, ETF, crypto regulation, exchanges
3. macro_market: war, geopolitics, Fed, rates, tariffs, stock crash, sanctions, inflation — infer crypto impact even without crypto keywords
4. off_topic: sports, personal life, unrelated — cryptoSentiment must be null, momentumStrength null
5. bullish: risk-on, positive regulation, rate cuts, crypto adoption, relief rally expected
6. bearish: risk-off, conflict, tightening, bans, panic, negative regulation
7. neutral: informational, mixed, or negligible expected market impact
8. momentumStrength: how urgent/strong the expected market reaction (breaking war = strong bearish)
9. Do not invent tickers; use provided token hints only if clearly referenced
10. War/conflict escalation → macro_market + bearish + strong momentum`;

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  return new OpenAI({ apiKey: key });
}

export function getSentimentModel(): string {
  return process.env.KOL_SENTIMENT_MODEL ?? "o3";
}

function parseClassification(raw: string): ClassificationResult {
  const parsed = JSON.parse(raw) as Partial<ClassificationResult>;
  const topicCategory = parsed.topicCategory;
  if (
    topicCategory !== "direct_crypto" &&
    topicCategory !== "macro_market" &&
    topicCategory !== "off_topic"
  ) {
    throw new Error(`Invalid topicCategory: ${String(topicCategory)}`);
  }

  let cryptoSentiment: CryptoSentiment | null = parsed.cryptoSentiment ?? null;
  if (topicCategory === "off_topic") cryptoSentiment = null;
  if (
    cryptoSentiment !== null &&
    cryptoSentiment !== "bullish" &&
    cryptoSentiment !== "neutral" &&
    cryptoSentiment !== "bearish"
  ) {
    throw new Error(`Invalid cryptoSentiment: ${String(cryptoSentiment)}`);
  }

  const momentumStrength = parsed.momentumStrength ?? null;
  if (
    momentumStrength !== null &&
    momentumStrength !== "weak" &&
    momentumStrength !== "moderate" &&
    momentumStrength !== "strong"
  ) {
    throw new Error(`Invalid momentumStrength: ${String(momentumStrength)}`);
  }

  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
  const reasoning = String(parsed.reasoning ?? "").slice(0, 200);
  const affectedAssets = Array.isArray(parsed.affectedAssets)
    ? parsed.affectedAssets.map(String).slice(0, 10)
    : [];

  return {
    topicCategory,
    cryptoSentiment,
    confidence,
    momentumStrength: topicCategory === "off_topic" ? null : momentumStrength,
    reasoning,
    affectedAssets,
  };
}

export async function classifyPost(
  text: string,
  authorUsername: string,
  tokenSymbols: string[] = [],
  tokenAddresses: string[] = [],
): Promise<ClassificationResult> {
  const openai = getOpenAI();
  const model = getSentimentModel();
  const isReasoningModel = model.startsWith("o");

  const userContent = [
    `Author: @${authorUsername}`,
    tokenSymbols.length > 0 ? `Detected tickers: ${tokenSymbols.join(", ")}` : null,
    tokenAddresses.length > 0 ? `Detected addresses: ${tokenAddresses.join(", ")}` : null,
    `Post:\n${text}`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await openai.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    ...(isReasoningModel ? {} : { temperature: 0.2 }),
  });

  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error("Empty classification response");
  return parseClassification(content);
}

export async function classifyPendingPosts(limit = 20): Promise<{ classified: number; failed: number }> {
  if (!process.env.OPENAI_API_KEY) return { classified: 0, failed: 0 };

  const { prisma } = await import("@/lib/prisma");
  const pending = await prisma.kolMentionCache.findMany({
    where: { classificationStatus: { in: ["pending", "failed"] } },
    orderBy: { tweetedAt: "desc" },
    take: limit,
    include: { kolProfile: true },
  });

  let classified = 0;
  let failed = 0;

  for (const post of pending) {
    try {
      const symbols: string[] = post.tokenSymbols ? JSON.parse(post.tokenSymbols) : [];
      const addresses: string[] = post.tokenAddresses ? JSON.parse(post.tokenAddresses) : [];
      const result = await classifyPost(
        post.text,
        post.kolProfile.twitterUsername,
        symbols,
        addresses,
      );

      await prisma.kolMentionCache.update({
        where: { id: post.id },
        data: {
          topicCategory: result.topicCategory,
          cryptoSentiment: result.cryptoSentiment,
          confidence: result.confidence,
          reasoning: result.reasoning,
          momentumStrength: result.momentumStrength,
          affectedAssets: JSON.stringify(result.affectedAssets),
          classificationStatus: "done",
          classifiedAt: new Date(),
          classificationModel: getSentimentModel(),
        },
      });
      classified++;
    } catch (err) {
      console.error(`[kol-sentiment] classify failed tweet ${post.tweetId}:`, err);
      await prisma.kolMentionCache.update({
        where: { id: post.id },
        data: { classificationStatus: "failed" },
      });
      failed++;
    }
  }

  return { classified, failed };
}
