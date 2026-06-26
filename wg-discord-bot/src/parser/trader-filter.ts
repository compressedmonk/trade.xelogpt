import { config } from "../config.js";

export function isFollowedTrader(trader: string): boolean {
  if (!trader) return false;
  const normalized = trader.toLowerCase();
  return config.followedTraders.some((t) => t.toLowerCase() === normalized);
}
