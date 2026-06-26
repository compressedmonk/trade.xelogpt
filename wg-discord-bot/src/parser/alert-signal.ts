import type { AlertAction, ParsedAlert } from "./types.js";
import { config } from "../config.js";
import {
  extractAssetAndBodyFromWgAlert,
  looksLikeWgAlert,
  normalizeWgAlertText,
} from "./alert-normalize.js";
import { isFollowedTrader } from "./trader-filter.js";

const STOCK_TICKERS = new Set([
  "GOOG", "GOOGL", "AAPL", "MSFT", "AMZN", "META", "TSLA", "NVDA", "NFLX",
  "PLTR", "MU", "SMCI", "CTVA", "US500",
]);

interface PatternDef {
  re: RegExp;
  build: (m: RegExpMatchArray, asset: string, trader: string) => AlertAction;
}

const PATTERNS: PatternDef[] = [
  {
    re: /limit order cancel/i,
    build: (_m, asset, trader) => ({ type: "cancel_limit", asset, trader }),
  },
  {
    re: /limit order fill/i,
    build: (_m, asset, trader) => ({ type: "limit_filled", asset, trader }),
  },
  {
    re: /stopped be/i,
    build: (_m, asset, trader) => ({ type: "immediate_close", asset, trader, closePct: 100 }),
  },
  {
    re: /closed small loss/i,
    build: (_m, asset, trader) => ({ type: "immediate_close", asset, trader, closePct: 100 }),
  },
  {
    re: /stopped out/i,
    build: (_m, asset, trader) => ({ type: "immediate_close", asset, trader, closePct: 100 }),
  },
  {
    re: /closed (?:in )?profits?\s*\(100%\)/i,
    build: (_m, asset, trader) => ({ type: "immediate_close", asset, trader, closePct: 100 }),
  },
  {
    re: /closed (?:in )?profits?\s*\((\d+)%\)/i,
    build: (m, asset, trader) => ({
      type: "immediate_close",
      asset,
      trader,
      closePct: Number(m[1]),
    }),
  },
  {
    re: /closed be\s*\(100%\)/i,
    build: (_m, asset, trader) => ({ type: "immediate_close", asset, trader, closePct: 100 }),
  },
  {
    re: /tp\d+\s*\((\d+)%\)/i,
    build: (m, asset, trader) => ({
      type: "immediate_close",
      asset,
      trader,
      closePct: Number(m[1]),
    }),
  },
  {
    re: /stops moved to be/i,
    build: (_m, asset, trader) => ({ type: "move_sl", asset, trader, newSl: "BE" }),
  },
  {
    re: /stops moved to\s+([\d.]+)/i,
    build: (m, asset, trader) => ({
      type: "move_sl",
      asset,
      trader,
      newSl: Number(m[1]),
    }),
  },
];

function extractAssetAndBody(line: string): { asset: string; body: string } | null {
  const wg = extractAssetAndBodyFromWgAlert(line);
  if (wg) return wg;

  const m = line.match(/^(?:🔼|🔻|🏛️|💰|🏦)?\s*([A-Z][A-Z0-9]*)\s*:\s*(.+)$/i);
  if (!m) return null;
  return { asset: m[1].toUpperCase(), body: m[2] };
}

function extractTrader(line: string): string {
  const matches = [...line.matchAll(/@([A-Za-z0-9_-]+)/g)];
  if (matches.length) return matches[matches.length - 1][1];
  if (config.followedTraders.length === 1) return config.followedTraders[0];
  return "";
}

function isStockSkip(asset: string, line: string): boolean {
  if (line.includes("🏛️") || line.includes("🏦")) return true;
  if (/<:Spot:/i.test(line)) return true;
  return STOCK_TICKERS.has(asset);
}

export function parseAlert(raw: string): ParsedAlert | null {
  if (!looksLikeWgAlert(raw)) return null;

  const line = normalizeWgAlertText(raw);
  const parsed = extractAssetAndBody(raw);
  if (!parsed) return null;

  const { asset, body } = parsed;
  const trader = extractTrader(raw);
  const actions: AlertAction[] = [];

  if (isStockSkip(asset, raw)) {
    return {
      asset,
      trader,
      actions: [{ type: "skip", asset, trader, reason: "stock_ticker" }],
      rawText: raw,
    };
  }

  for (const pat of PATTERNS) {
    const m = body.match(pat.re);
    if (m) actions.push(pat.build(m, asset, trader));
  }

  if (actions.length === 0) return null;

  if (!isFollowedTrader(trader)) {
    return {
      asset,
      trader,
      actions: [{ type: "skip", asset, trader, reason: "not_followed" }],
      rawText: raw,
    };
  }

  return { asset, trader, actions, rawText: raw };
}

export function shouldExecuteAlert(alert: ParsedAlert): boolean {
  return alert.actions.some((a) => a.type !== "skip");
}

export { looksLikeWgAlert };
