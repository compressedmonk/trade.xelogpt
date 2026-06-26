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
