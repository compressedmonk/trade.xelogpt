import type { KlineBar } from "../binance/client.js";
import { takerSellRatio, volumeBaseline, type VolumeBaseline } from "./indicators.js";
import type { SignificantLevel } from "./levels.js";
import type { LiquidationTracker } from "./liquidation-tracker.js";
import type { FundingTracker } from "./funding-tracker.js";
import type { VelocityTracker } from "./velocity.js";
import { config } from "../config.js";

export interface ConfluenceBreakdown {
  liquidation: number;
  sweep: number;
  velocity: number;
  geometry: number;
  volume: number;
  delta: number;
  positioning: number;
  total: number;
}

export interface ConfluenceInput {
  side: "long" | "short";
  bar: KlineBar;
  atr: number;
  sweptLevel: SignificantLevel;
  sweepExtremum: number;
  liqTracker: LiquidationTracker;
  fundingTracker: FundingTracker;
  velocity: VelocityTracker;
  closedBars: KlineBar[];
  volBaseline: VolumeBaseline;
}

function clampScore(value: number, max: number): number {
  return Math.min(max, Math.max(0, value));
}

export function scoreConfluence(input: ConfluenceInput): ConfluenceBreakdown {
  const {
    side,
    bar,
    atr,
    sweptLevel,
    sweepExtremum,
    liqTracker,
    fundingTracker,
    velocity,
    closedBars,
    volBaseline,
  } = input;

  const liqBurst = liqTracker.burstRatio(side);
  const liquidation = clampScore((liqBurst / config.liqBurstMult) * 22, 22);

  const sweepDistance =
    side === "long"
      ? Math.max(0, sweptLevel.price - sweepExtremum)
      : Math.max(0, sweepExtremum - sweptLevel.price);
  const sweepAtr = atr > 0 ? sweepDistance / atr : 0;
  const sweep = clampScore((sweepAtr / config.sweepAtrK) * sweptLevel.weight * 7.2, 18);

  const velAtr = velocity.normalizedMoveAtr(atr, side);
  const velocityScore = clampScore((velAtr / 1.5) * 15, 15);

  const wick =
    side === "long"
      ? Math.min(bar.open, bar.close) - bar.low
      : bar.high - Math.max(bar.open, bar.close);
  const wickAtr = atr > 0 ? wick / atr : 0;
  const range = bar.high - bar.low;
  const closePosition = range > 0 ? (bar.close - bar.low) / range : 0.5;
  const reclaimOk = side === "long" ? closePosition >= 0.4 : closePosition <= 0.6;
  const geometry = clampScore(wickAtr * 5 + (reclaimOk ? 5 : 0), 15);

  const quoteVol = bar.quoteVolume ?? bar.volume * bar.close;
  const tradeCount = bar.tradeCount ?? 0;
  const volRatio = volBaseline.quoteVolumeAvg > 0 ? quoteVol / volBaseline.quoteVolumeAvg : 0;
  const tradeRatio = volBaseline.tradeCountAvg > 0 ? tradeCount / volBaseline.tradeCountAvg : 0;
  const volume = clampScore(((volRatio + tradeRatio) / 2 / config.volSpikeMult) * 10, 10);

  const sellRatio = takerSellRatio(bar);
  const priorBars = closedBars.slice(-5);
  const priorSellAvg =
    priorBars.length > 0
      ? priorBars.reduce((s, b) => s + takerSellRatio(b), 0) / priorBars.length
      : 0.5;
  const deltaDivergence =
    side === "long"
      ? sellRatio > 0.55 && sellRatio > priorSellAvg && bar.low >= sweepExtremum * 0.999
      : sellRatio < 0.45 && sellRatio < priorSellAvg && bar.high <= sweepExtremum * 1.001;
  const delta = deltaDivergence ? 10 : clampScore(Math.abs(sellRatio - priorSellAvg) * 20, 6);

  const positioning = clampScore(fundingTracker.positioningScore(side), 10);
  const biasPenalty = fundingTracker.contradictionPenalty(side);

  const rawTotal =
    liquidation + sweep + velocityScore + geometry + volume + delta + positioning - biasPenalty;
  const total = Math.round(Math.min(100, Math.max(0, rawTotal)));

  return {
    liquidation,
    sweep,
    velocity: velocityScore,
    geometry,
    volume,
    delta,
    positioning,
    total,
  };
}
