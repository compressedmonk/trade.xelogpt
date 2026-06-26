import { config } from "../config.js";
import type { ParsedLimitSignal } from "./types.js";
import { sanitizeUnlockedContent } from "./sanitize-unlocked.js";

function inferTraderFromFollowedList(raw: string): string {
  for (const t of config.followedTraders) {
    if (new RegExp(`@${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(raw)) {
      return t;
    }
  }
  return "";
}

function defaultTraderIfSingle(): string {
  return config.followedTraders.length === 1 ? config.followedTraders[0] : "";
}

function parseNum(s: string): number {
  return Number(s.replace(/,/g, ""));
}

function inferSide(
  entryA: number,
  entryB: number,
  sl: number,
  explicit?: "long" | "short",
): "long" | "short" {
  if (explicit) return explicit;
  const mid = (entryA + entryB) / 2;
  return sl < mid ? "long" : "short";
}

function parseEmbedLine(line: string): Partial<ParsedLimitSignal> | null {
  const range = line.match(
    /LIMIT\s+(\w+)\s*\|\s*Entry:\s*([\d.,]+)\s*[−\-]\s*([\d.,]+)\s*\|\s*SL:\s*([\d.,]+).*?Risk:\s*([\d.]+)%/i,
  );
  if (range) {
    const e1 = parseNum(range[2]);
    const e2 = parseNum(range[3]);
    return {
      asset: range[1].toUpperCase(),
      entryMax: Math.max(e1, e2),
      entryMin: Math.min(e1, e2),
      stopLoss: parseNum(range[4]),
      riskPct: parseNum(range[5]),
    };
  }

  const single = line.match(
    /LIMIT\s+(\w+)\s*\|\s*Entry:\s*([\d.,]+)\s*\|\s*SL:\s*([\d.,]+).*?Risk:\s*([\d.]+)%/i,
  );
  if (!single) return null;

  const entry = parseNum(single[2]);
  return {
    asset: single[1].toUpperCase(),
    entryMax: entry,
    entryMin: entry,
    stopLoss: parseNum(single[3]),
    riskPct: parseNum(single[4]),
  };
}

function parseContentLine(line: string): Partial<ParsedLimitSignal> | null {
  const withSide = line.match(
    /@?(\w+)\s+(\w+)\s+limit\s+(long|short)\s+([\d.,]+)\s*[-–]?\s*([\d.,]+)?\s+(?:sl|stop)\s+([\d.,]+)/i,
  );
  if (withSide) {
    const e1 = parseNum(withSide[4]);
    const e2 = withSide[5] ? parseNum(withSide[5]) : e1;
    return {
      trader: withSide[1],
      asset: withSide[2].toUpperCase(),
      side: withSide[3].toLowerCase() as "long" | "short",
      entryMax: Math.max(e1, e2),
      entryMin: Math.min(e1, e2),
      stopLoss: parseNum(withSide[6]),
    };
  }

  const stockEntry = line.match(
    /(\w+)\s+stock\s+(long|short)\s+limit\s+entry:\s*([\d.,]+)\s+sl:\s*([\d.,]+)/i,
  );
  if (stockEntry) {
    const entry = parseNum(stockEntry[3]);
    return {
      asset: stockEntry[1].toUpperCase(),
      side: stockEntry[2].toLowerCase() as "long" | "short",
      entryMax: entry,
      entryMin: entry,
      stopLoss: parseNum(stockEntry[4]),
    };
  }

  const simple = line.match(
    /(\w+)\s+limit\s+([\d.,]+)\s+([\d.,]+)\s+stop\s+([\d.,]+)/i,
  );
  if (!simple) return null;

  const e1 = parseNum(simple[2]);
  const e2 = parseNum(simple[3]);
  const sl = parseNum(simple[4]);

  return {
    asset: simple[1].toUpperCase(),
    entryMax: Math.max(e1, e2),
    entryMin: Math.min(e1, e2),
    stopLoss: sl,
  };
}

function parseStatus(line?: string): ParsedLimitSignal["status"] {
  if (!line) return "other";
  return /valid limit order/i.test(line) ? "valid_limit" : "other";
}

export function parseLimitSignal(
  raw: string,
  sourceMessageId: string,
  defaultRiskPct = 1,
): ParsedLimitSignal | null {
  const clean = sanitizeUnlockedContent(raw);
  const partial = (clean.embedLine && parseEmbedLine(clean.embedLine)) ||
    (clean.contentLine && parseContentLine(clean.contentLine)) ||
    clean.lines.map(parseContentLine).find(Boolean) ||
    clean.lines.map(parseEmbedLine).find(Boolean);

  if (!partial?.asset || partial.entryMax == null || partial.entryMin == null || !partial.stopLoss) {
    return null;
  }

  const side = inferSide(
    partial.entryMax,
    partial.entryMin,
    partial.stopLoss,
    partial.side,
  );

  const trader =
    partial.trader ||
    clean.trader ||
    inferTraderFromFollowedList(raw) ||
    defaultTraderIfSingle();

  return {
    trader,
    asset: partial.asset,
    side,
    entryMax: partial.entryMax,
    entryMin: partial.entryMin,
    stopLoss: partial.stopLoss,
    riskPct: partial.riskPct ?? defaultRiskPct,
    status: /valid limit order/i.test(raw) ? "valid_limit" : parseStatus(clean.statusLine),
    sourceMessageId,
    rawText: raw,
  };
}

export function isValidForExecution(signal: ParsedLimitSignal): boolean {
  return signal.status === "valid_limit";
}
