import { prisma } from "@/lib/prisma";

export interface NewsmakerSeed {
  twitterUsername: string;
  displayName: string;
  sentimentWeight: number;
  notes?: string;
}

export const NEWSMAKER_SEED: NewsmakerSeed[] = [
  {
    twitterUsername: "realdonaldtrump",
    displayName: "Donald Trump",
    sentimentWeight: 2.0,
    notes: "US policy, tariffs, crypto statements",
  },
  {
    twitterUsername: "elonmusk",
    displayName: "Elon Musk",
    sentimentWeight: 2.0,
    notes: "Macro + DOGE/crypto influence",
  },
  {
    twitterUsername: "deltaone",
    displayName: "Walter Bloomberg",
    sentimentWeight: 1.8,
    notes: "Breaking macro/market headlines",
  },
  {
    twitterUsername: "unusual_whales",
    displayName: "Unusual Whales",
    sentimentWeight: 1.5,
    notes: "Market flow / breaking news",
  },
  {
    twitterUsername: "tier10k",
    displayName: "db",
    sentimentWeight: 1.4,
    notes: "Crypto-native breaking news",
  },
];

/**
 * Restores the default newsmaker profiles when none exist in the DB.
 * This guards against data loss (e.g. a recreated SQLite volume on deploy),
 * which otherwise leaves the Sentiment page empty until a manual re-import.
 * Only seeds when there are zero newsmakers, so deliberate per-profile
 * deletions are preserved once a list exists.
 */
export async function ensureNewsmakerSeed(): Promise<number> {
  const existing = await prisma.kolProfile.count({
    where: { profileType: "newsmaker" },
  });
  if (existing > 0) return 0;

  let seeded = 0;
  for (const seed of NEWSMAKER_SEED) {
    await prisma.kolProfile.upsert({
      where: { twitterUsername: seed.twitterUsername },
      update: {
        enabled: true,
        profileType: "newsmaker",
        sentimentWeight: seed.sentimentWeight,
        displayName: seed.displayName,
      },
      create: {
        twitterUsername: seed.twitterUsername,
        displayName: seed.displayName,
        profileType: "newsmaker",
        sentimentWeight: seed.sentimentWeight,
      },
    });
    seeded++;
  }
  return seeded;
}
