export type KolCategory = "builder" | "trader" | "news" | "memecoin" | "community";

export interface SeedKol {
  twitterUsername: string;
  displayName: string;
  category: KolCategory;
  approxFollowers: number;
  notes?: string;
}

/** Bootstrap: widely known Solana X accounts (not only memecoin). */
export const SOLANA_KOL_SEED: SeedKol[] = [
  { twitterUsername: "aeyakovenko", displayName: "Anatoly Yakovenko", category: "builder", approxFollowers: 450_000, notes: "Solana co-founder" },
  { twitterUsername: "0xMert_", displayName: "Mert", category: "builder", approxFollowers: 150_000, notes: "Helius CEO" },
  { twitterUsername: "toly", displayName: "Toly", category: "builder", approxFollowers: 120_000, notes: "Solana ecosystem" },
  { twitterUsername: "rajgokal", displayName: "Raj Gokal", category: "builder", approxFollowers: 200_000, notes: "Solana co-founder" },
  { twitterUsername: "armaniferrante", displayName: "Armani Ferrante", category: "builder", approxFollowers: 80_000, notes: "Backpack / Anchor" },
  { twitterUsername: "0xSoju", displayName: "Soju", category: "builder", approxFollowers: 50_000, notes: "Jupiter" },
  { twitterUsername: "meow", displayName: "Meow", category: "builder", approxFollowers: 40_000, notes: "Jupiter" },
  { twitterUsername: "blknoiz06", displayName: "Ansem", category: "trader", approxFollowers: 940_000, notes: "Solana trader" },
  { twitterUsername: "FrankDeGods", displayName: "Frank DeGods", category: "community", approxFollowers: 400_000, notes: "DeGods / y00ts" },
  { twitterUsername: "DegenerateNews", displayName: "Degen News", category: "news", approxFollowers: 150_000, notes: "Solana breaking news" },
  { twitterUsername: "A1lon9", displayName: "Alon", category: "builder", approxFollowers: 200_000, notes: "Pump.fun co-founder" },
  { twitterUsername: "theunipcs", displayName: "Bonk Guy", category: "memecoin", approxFollowers: 100_000, notes: "BONK advocate" },
  { twitterUsername: "MustStopMurad", displayName: "Murad", category: "memecoin", approxFollowers: 200_000, notes: "Memecoin narrative" },
  { twitterUsername: "kmoney_69", displayName: "Kmoney", category: "trader", approxFollowers: 100_000, notes: "Memecoin trader" },
  { twitterUsername: "orangie", displayName: "Orangie", category: "memecoin", approxFollowers: 200_000, notes: "YouTube / Solana" },
  { twitterUsername: "TheOnlyNom", displayName: "Nom", category: "community", approxFollowers: 63_000, notes: "MonkeDAO / BONK" },
  { twitterUsername: "NebOnChain", displayName: "Neb", category: "community", approxFollowers: 43_000, notes: "Solana community" },
  { twitterUsername: "SolanaLegend", displayName: "Solana Legend", category: "trader", approxFollowers: 80_000, notes: "Solana trader" },
  { twitterUsername: "SolJakey", displayName: "Jakey", category: "community", approxFollowers: 60_000, notes: "Solana content" },
  { twitterUsername: "0xGumshoe", displayName: "Gumshoe", category: "news", approxFollowers: 50_000, notes: "Solana research" },
  { twitterUsername: "SOLBigBrain", displayName: "SOL Big Brain", category: "trader", approxFollowers: 70_000, notes: "Solana alpha" },
  { twitterUsername: "SolanaFloor", displayName: "Solana Floor", category: "news", approxFollowers: 90_000, notes: "Solana news" },
  { twitterUsername: "SolanaStatus", displayName: "Solana Status", category: "news", approxFollowers: 250_000, notes: "Network status" },
  { twitterUsername: "DegenApeAcademy", displayName: "Degen Ape Academy", category: "community", approxFollowers: 55_000, notes: "NFT community" },
  { twitterUsername: "MadLads", displayName: "Mad Lads", category: "community", approxFollowers: 100_000, notes: "Backpack NFT" },
  { twitterUsername: "tensor_hq", displayName: "Tensor", category: "builder", approxFollowers: 80_000, notes: "NFT marketplace" },
  { twitterUsername: "JupiterExchange", displayName: "Jupiter", category: "builder", approxFollowers: 300_000, notes: "DEX aggregator" },
  { twitterUsername: "marinade_finance", displayName: "Marinade", category: "builder", approxFollowers: 40_000, notes: "Liquid staking" },
  { twitterUsername: "marginfi", displayName: "marginfi", category: "builder", approxFollowers: 35_000, notes: "DeFi lending" },
  { twitterUsername: "KaminoFinance", displayName: "Kamino", category: "builder", approxFollowers: 45_000, notes: "DeFi" },
  { twitterUsername: "DriftProtocol", displayName: "Drift", category: "builder", approxFollowers: 50_000, notes: "Perps DEX" },
  { twitterUsername: "phantom", displayName: "Phantom", category: "builder", approxFollowers: 400_000, notes: "Wallet" },
  { twitterUsername: "CryptoWendyO", displayName: "Wendy O", category: "trader", approxFollowers: 200_000, notes: "Crypto trader / media" },
  { twitterUsername: "Rasmr_eth", displayName: "Rasmr", category: "trader", approxFollowers: 80_000, notes: "Trader" },
  { twitterUsername: "ValueandTime", displayName: "Value & Time", category: "trader", approxFollowers: 60_000, notes: "Solana trader" },
  { twitterUsername: "0xVonGogh", displayName: "VonGogh", category: "memecoin", approxFollowers: 50_000, notes: "Memecoin" },
  { twitterUsername: "973Meech", displayName: "Meech", category: "memecoin", approxFollowers: 40_000, notes: "Memecoin" },
  { twitterUsername: "NotChaseColeman", displayName: "Chase Coleman", category: "memecoin", approxFollowers: 30_000, notes: "Memecoin signals" },
  { twitterUsername: "Renzofks", displayName: "Renzo", category: "memecoin", approxFollowers: 25_000, notes: "Memecoin" },
];
