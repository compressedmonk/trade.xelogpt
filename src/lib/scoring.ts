import type { TokenRank } from "./gmgn-client";

export type Signal = "pass" | "watch" | "skip";

export function scoreToken(t: TokenRank): Signal {
  if (t.rug_ratio > 0.3 || t.is_wash_trading || t.is_honeypot === 1) return "skip";

  const hasSmartMoney = t.smart_degen_count >= 3;
  const hasKolBacking = t.renowned_count >= 2;
  const isSafe = t.rug_ratio < 0.2 && !t.is_wash_trading;

  if (isSafe && (hasSmartMoney || hasKolBacking)) return "pass";
  if (isSafe && (t.smart_degen_count >= 1 || t.renowned_count >= 1)) return "watch";
  return "watch";
}

export function signalColor(s: Signal) {
  return s === "pass" ? "text-cyan-400" : s === "skip" ? "text-brand-red" : "text-brand-yellow";
}

export function signalLabel(s: Signal) {
  return s === "pass" ? "PASS" : s === "skip" ? "SKIP" : "WATCH";
}

export function formatPrice(price: number | null | undefined): string {
  if (price == null || price === 0) return "$0";
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  if (price >= 0.0001) return `$${price.toFixed(6)}`;
  return `$${price.toExponential(2)}`;
}

export function formatMarketCap(mc: number | null | undefined): string {
  if (mc == null) return "—";
  if (mc >= 1_000_000_000) return `$${(mc / 1_000_000_000).toFixed(1)}B`;
  if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(1)}M`;
  if (mc >= 1_000) return `$${(mc / 1_000).toFixed(1)}K`;
  return `$${mc.toFixed(0)}`;
}

export function formatVolume(v: number): string {
  return formatMarketCap(v);
}

export function formatPercent(p: number): string {
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
}

export function timeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
