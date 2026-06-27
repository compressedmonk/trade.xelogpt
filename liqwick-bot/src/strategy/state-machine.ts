import { randomUUID } from "node:crypto";
import type { Regime } from "../regime/detector.js";
import type { KlineBar } from "../binance/client.js";
import type { SignificantLevel } from "./levels.js";
import { nearestResistance, nearestSupport } from "./levels.js";
import { scoreConfluence, type ConfluenceBreakdown } from "./confluence.js";
import { volumeBaseline } from "./indicators.js";
import type { LiquidationTracker } from "./liquidation-tracker.js";
import type { FundingTracker } from "./funding-tracker.js";
import type { VelocityTracker } from "./velocity.js";
import { config, type EntryMode } from "../config.js";
import type { SweepJournalEntry } from "./sweep-journal.js";
import { classifySweepOutcome } from "./sweep-journal.js";

export type SweepPhase = "idle" | "sweeping" | "cooldown";

export interface SymbolSweepState {
  phase: SweepPhase;
  side: "long" | "short" | null;
  sweepStartedAt: number;
  sweepId: string;
  extremum: number;
  sweptLevel: SignificantLevel | null;
  lastScore: ConfluenceBreakdown | null;
  peakScore: number;
  peakScoreBreakdown: ConfluenceBreakdown | null;
  maxDepthAtr: number;
  scoreReachedThreshold: boolean;
  reversalSeen: boolean;
  startAtr: number;
  startFundingRate: number;
  startBasisBps: number;
  cooldownUntil: number;
}

export interface WickSignal {
  side: "long" | "short";
  symbol: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  sweepLevel: number;
  atr: number;
  score: ConfluenceBreakdown;
  reason: string;
  sweepId: string;
}

export type StateEvent =
  | { type: "enter"; signal: WickSignal; journal: SweepJournalEntry }
  | { type: "sweep_closed"; journal: SweepJournalEntry }
  | { type: "phase"; phase: SweepPhase; side: "long" | "short" | null; score?: number };

export interface EvaluateContext {
  symbol: string;
  regime: Regime;
  bar: KlineBar;
  atr: number;
  levels: SignificantLevel[];
  closedBars: KlineBar[];
  liqTracker: LiquidationTracker;
  fundingTracker: FundingTracker;
  velocity: VelocityTracker;
  state: SymbolSweepState;
  now: number;
  entryMode: EntryMode;
}

export function initialSweepState(): SymbolSweepState {
  return {
    phase: "idle",
    side: null,
    sweepStartedAt: 0,
    sweepId: "",
    extremum: 0,
    sweptLevel: null,
    lastScore: null,
    peakScore: 0,
    peakScoreBreakdown: null,
    maxDepthAtr: 0,
    scoreReachedThreshold: false,
    reversalSeen: false,
    startAtr: 0,
    startFundingRate: 0,
    startBasisBps: 0,
    cooldownUntil: 0,
  };
}

function computeSlTp(
  side: "long" | "short",
  entry: number,
  extremum: number,
  atr: number,
): { stopLoss: number; takeProfit1: number; takeProfit2: number } | null {
  const slDistance = Math.max(config.slAtrK * atr, atr * config.slMinAtr);
  const maxSl = config.slMaxAtr * atr;
  if (slDistance > maxSl) return null;

  if (side === "long") {
    const stopLoss = extremum - slDistance;
    const risk = entry - stopLoss;
    if (risk <= 0) return null;
    return {
      stopLoss,
      takeProfit1: entry + risk * config.tp1R,
      takeProfit2: entry + risk * config.tp2R,
    };
  }

  const stopLoss = extremum + slDistance;
  const risk = stopLoss - entry;
  if (risk <= 0) return null;
  return {
    stopLoss,
    takeProfit1: entry - risk * config.tp1R,
    takeProfit2: entry - risk * config.tp2R,
  };
}

function reversalConfirmed(
  side: "long" | "short",
  bar: KlineBar,
  extremum: number,
  atr: number,
  velocity: VelocityTracker,
): boolean {
  if (config.entryMode === "knife") return true;
  const pullback = side === "long" ? bar.close - extremum : extremum - bar.close;
  return pullback >= config.reversalAtrK * atr && velocity.directionReversed(side);
}

function buildJournal(
  ctx: EvaluateContext,
  state: SymbolSweepState,
  params: {
    outcome?: SweepJournalEntry["outcome"];
    blockReason?: string;
    abortReason?: string;
    hadEnterSignal?: boolean;
    entryPrice?: number;
    stopLoss?: number;
    takeProfit1?: number;
    takeProfit2?: number;
  },
): SweepJournalEntry {
  const side = state.side as "long" | "short";
  const depthAtr =
    ctx.atr > 0 && state.sweptLevel
      ? side === "long"
        ? (state.sweptLevel.price - state.extremum) / ctx.atr
        : (state.extremum - state.sweptLevel.price) / ctx.atr
      : 0;

  const classified =
    params.outcome && (params.outcome === "triggered" || params.outcome.startsWith("skipped"))
      ? { outcome: params.outcome, blockReason: params.blockReason }
      : classifySweepOutcome({
          abortReason: params.abortReason,
          scoreReachedThreshold: state.scoreReachedThreshold,
          reversalSeen: state.reversalSeen,
          peakScore: state.peakScore,
          enterThreshold: config.enterThreshold,
          hadEnterSignal: params.hadEnterSignal ?? false,
        });

  return {
    sweepId: state.sweepId,
    symbol: ctx.symbol,
    side,
    regime: ctx.regime,
    outcome: classified.outcome,
    blockReason: params.blockReason ?? classified.blockReason,
    sweptLevel: state.sweptLevel!.price,
    levelType: state.sweptLevel!.type,
    extremum: state.extremum,
    depthAtr,
    maxDepthAtr: state.maxDepthAtr,
    atr: ctx.atr,
    durationMs: ctx.now - state.sweepStartedAt,
    peakScore: state.peakScore,
    finalScore: state.lastScore?.total ?? 0,
    enterThreshold: config.enterThreshold,
    scoreBreakdown: state.peakScoreBreakdown,
    fundingRate: ctx.fundingTracker.fundingRate,
    basisBps: ctx.fundingTracker.basisBps,
    liqBurstRatio: ctx.liqTracker.burstRatio(side),
    reversalSeen: state.reversalSeen,
    scoreReachedThreshold: state.scoreReachedThreshold,
    entryPrice: params.entryPrice,
    stopLoss: params.stopLoss,
    takeProfit1: params.takeProfit1,
    takeProfit2: params.takeProfit2,
  };
}

function closeSweep(
  ctx: EvaluateContext,
  state: SymbolSweepState,
  journalParams: Parameters<typeof buildJournal>[2],
  cooldownMs: number,
): { state: SymbolSweepState; events: StateEvent[] } {
  const journal = buildJournal(ctx, state, journalParams);
  return {
    state: {
      ...initialSweepState(),
      phase: "cooldown",
      cooldownUntil: ctx.now + cooldownMs,
    },
    events: [
      { type: "sweep_closed", journal },
      { type: "phase", phase: "cooldown", side: null },
    ],
  };
}

function startSweep(
  ctx: EvaluateContext,
  side: "long" | "short",
  level: SignificantLevel,
  extremum: number,
): SymbolSweepState {
  return {
    phase: "sweeping",
    side,
    sweepStartedAt: ctx.now,
    sweepId: randomUUID(),
    extremum,
    sweptLevel: level,
    lastScore: null,
    peakScore: 0,
    peakScoreBreakdown: null,
    maxDepthAtr: 0,
    scoreReachedThreshold: false,
    reversalSeen: false,
    startAtr: ctx.atr,
    startFundingRate: ctx.fundingTracker.fundingRate,
    startBasisBps: ctx.fundingTracker.basisBps,
    cooldownUntil: 0,
  };
}

function updateSweepMetrics(
  ctx: EvaluateContext,
  state: SymbolSweepState,
  score: ConfluenceBreakdown,
  depthAtr: number,
): SymbolSweepState {
  const next = { ...state, lastScore: score };
  if (score.total > next.peakScore) {
    next.peakScore = score.total;
    next.peakScoreBreakdown = score;
  }
  next.maxDepthAtr = Math.max(next.maxDepthAtr, depthAtr);
  if (score.total >= config.enterThreshold) next.scoreReachedThreshold = true;
  if (reversalConfirmed(next.side!, ctx.bar, next.extremum, ctx.atr, ctx.velocity)) {
    next.reversalSeen = true;
  }
  return next;
}

export function evaluateSweep(ctx: EvaluateContext): { state: SymbolSweepState; events: StateEvent[] } {
  const events: StateEvent[] = [];
  let state = { ...ctx.state };

  if (state.phase === "cooldown") {
    if (ctx.now >= state.cooldownUntil) {
      state = initialSweepState();
      events.push({ type: "phase", phase: "idle", side: null });
    } else {
      return { state, events };
    }
  }

  if (ctx.regime === "neutral") {
    if (state.phase === "sweeping" && state.side && state.sweptLevel) {
      const closed = closeSweep(ctx, state, { abortReason: "regime_reset" }, 0);
      state = closed.state;
      events.push(...closed.events);
      state = initialSweepState();
      events.push({ type: "phase", phase: "idle", side: null });
      return { state, events };
    }
    if (state.phase !== "idle") {
      state = initialSweepState();
      events.push({ type: "phase", phase: "idle", side: null });
    }
    return { state, events };
  }

  const expectedSide: "long" | "short" = ctx.regime === "bull" ? "long" : "short";
  const volBaseline = volumeBaseline(ctx.closedBars);

  if (state.phase === "idle") {
    if (expectedSide === "long") {
      const support = nearestSupport(ctx.levels, ctx.bar.low);
      if (support && ctx.bar.low < support.price - config.sweepAtrK * ctx.atr) {
        state = startSweep(ctx, "long", support, ctx.bar.low);
        events.push({ type: "phase", phase: "sweeping", side: "long" });
      }
    } else {
      const resistance = nearestResistance(ctx.levels, ctx.bar.high);
      if (resistance && ctx.bar.high > resistance.price + config.sweepAtrK * ctx.atr) {
        state = startSweep(ctx, "short", resistance, ctx.bar.high);
        events.push({ type: "phase", phase: "sweeping", side: "short" });
      }
    }
    return { state, events };
  }

  if (state.phase !== "sweeping" || !state.side || !state.sweptLevel) {
    return { state, events };
  }

  if (state.side === "long") {
    state.extremum = Math.min(state.extremum, ctx.bar.low);
  } else {
    state.extremum = Math.max(state.extremum, ctx.bar.high);
  }

  const elapsed = ctx.now - state.sweepStartedAt;
  const depthAtr =
    ctx.atr > 0
      ? state.side === "long"
        ? (state.sweptLevel.price - state.extremum) / ctx.atr
        : (state.extremum - state.sweptLevel.price) / ctx.atr
      : 0;
  const continuationAbort = depthAtr > config.sweepAtrK * 4;

  if (elapsed > config.sweepTimeoutMs || continuationAbort) {
    const closed = closeSweep(
      ctx,
      state,
      { abortReason: continuationAbort ? "continuation" : "timeout" },
      config.abortCooldownMs,
    );
    return { state: closed.state, events: [...events, ...closed.events] };
  }

  const score = scoreConfluence({
    side: state.side,
    bar: ctx.bar,
    atr: ctx.atr,
    sweptLevel: state.sweptLevel,
    sweepExtremum: state.extremum,
    liqTracker: ctx.liqTracker,
    fundingTracker: ctx.fundingTracker,
    velocity: ctx.velocity,
    closedBars: ctx.closedBars,
    volBaseline,
  });
  state = updateSweepMetrics(ctx, state, score, depthAtr);
  events.push({ type: "phase", phase: "sweeping", side: state.side, score: score.total });

  if (score.total < config.enterThreshold) {
    return { state, events };
  }

  if (!reversalConfirmed(state.side!, ctx.bar, state.extremum, ctx.atr, ctx.velocity)) {
    return { state, events };
  }

  const entry = ctx.bar.close;
  const side = state.side!;
  const sweptLevel = state.sweptLevel!;
  const sltp = computeSlTp(side, entry, state.extremum, ctx.atr);
  if (!sltp) {
    const closed = closeSweep(ctx, state, { abortReason: "sl_distance" }, config.abortCooldownMs);
    return { state: closed.state, events: [...events, ...closed.events] };
  }

  const journal = buildJournal(ctx, state, {
    outcome: "triggered",
    hadEnterSignal: true,
    entryPrice: entry,
    stopLoss: sltp.stopLoss,
    takeProfit1: sltp.takeProfit1,
    takeProfit2: sltp.takeProfit2,
  });

  events.push({
    type: "enter",
    journal,
    signal: {
      side,
      symbol: ctx.symbol,
      entryPrice: entry,
      stopLoss: sltp.stopLoss,
      takeProfit1: sltp.takeProfit1,
      takeProfit2: sltp.takeProfit2,
      sweepLevel: sweptLevel.price,
      atr: ctx.atr,
      score,
      reason: `confluence_${score.total}`,
      sweepId: state.sweepId,
    },
  });

  state = {
    ...initialSweepState(),
    phase: "cooldown",
    cooldownUntil: ctx.now + config.tradeCooldownMs,
  };
  events.push({ type: "phase", phase: "cooldown", side: null });

  return { state, events };
}
