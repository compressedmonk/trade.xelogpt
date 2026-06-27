import type { Regime } from "../regime/detector.js";
import type { ConfluenceBreakdown } from "./confluence.js";
import type { SignificantLevel } from "./levels.js";

export type SweepOutcome =
  | "triggered"
  | "skipped_circuit"
  | "skipped_exec"
  | "aborted_timeout"
  | "aborted_continuation"
  | "aborted_sl"
  | "blocked_low_score"
  | "blocked_no_reversal"
  | "regime_reset";

export interface SweepJournalEntry {
  sweepId: string;
  symbol: string;
  side: "long" | "short";
  regime: Regime;
  outcome: SweepOutcome;
  blockReason?: string;
  sweptLevel: number;
  levelType: string;
  extremum: number;
  depthAtr: number;
  maxDepthAtr: number;
  atr: number;
  durationMs: number;
  peakScore: number;
  finalScore: number;
  enterThreshold: number;
  scoreBreakdown: ConfluenceBreakdown | null;
  fundingRate: number;
  basisBps: number;
  liqBurstRatio: number;
  reversalSeen: boolean;
  scoreReachedThreshold: boolean;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit1?: number;
  takeProfit2?: number;
  signalId?: string;
}

export function classifySweepOutcome(params: {
  abortReason?: string;
  scoreReachedThreshold: boolean;
  reversalSeen: boolean;
  peakScore: number;
  enterThreshold: number;
  hadEnterSignal: boolean;
}): { outcome: SweepOutcome; blockReason?: string } {
  if (params.abortReason === "timeout") {
    const blockReason = params.scoreReachedThreshold
      ? params.reversalSeen
        ? "timeout_after_threshold"
        : "timeout_no_reversal"
      : "timeout_low_score";
    return { outcome: "aborted_timeout", blockReason };
  }
  if (params.abortReason === "continuation") {
    return { outcome: "aborted_continuation", blockReason: "depth_exceeded" };
  }
  if (params.abortReason === "sl_distance") {
    return { outcome: "aborted_sl", blockReason: "sl_out_of_range" };
  }
  if (params.abortReason === "regime_reset") {
    return { outcome: "regime_reset", blockReason: "regime_neutral" };
  }
  if (params.hadEnterSignal) {
    return { outcome: "triggered" };
  }
  if (params.scoreReachedThreshold && !params.reversalSeen) {
    return { outcome: "blocked_no_reversal", blockReason: "reversal_not_confirmed" };
  }
  if (params.peakScore < params.enterThreshold) {
    return { outcome: "blocked_low_score", blockReason: `peak_${params.peakScore}_lt_${params.enterThreshold}` };
  }
  return { outcome: "blocked_low_score", blockReason: "unknown" };
}

export function levelMeta(level: SignificantLevel): { price: number; type: string } {
  return { price: level.price, type: level.type };
}
