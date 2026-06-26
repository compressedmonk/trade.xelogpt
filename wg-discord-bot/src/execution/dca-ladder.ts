import type { ParsedLimitSignal } from "../parser/types.js";
import { config } from "../config.js";

export interface DcaLeg {
  step: 1 | 2 | 3;
  price: number;
  weightPct: number;
  quantity: number;
}

export interface DcaPlan {
  legs: DcaLeg[];
  stopLoss: number;
  totalRiskUsdt: number;
  side: "long" | "short";
  asset: string;
  symbol: string;
}

function midPrice(a: number, b: number): number {
  return (a + b) / 2;
}

export function buildDcaLadder(
  signal: ParsedLimitSignal,
  quantities: number[],
): DcaPlan {
  const weights = config.dcaWeights;
  const steps = config.dcaSteps;

  if (weights.length !== steps || quantities.length !== steps) {
    throw new Error(`Expected ${steps} weights and quantities`);
  }

  let prices: number[];

  if (signal.side === "long") {
    prices = [
      signal.entryMax,
      midPrice(signal.entryMax, signal.entryMin),
      signal.entryMin,
    ];
  } else {
    prices = [
      signal.entryMin,
      midPrice(signal.entryMin, signal.entryMax),
      signal.entryMax,
    ];
  }

  const legs: DcaLeg[] = prices.map((price, i) => ({
    step: (i + 1) as 1 | 2 | 3,
    price,
    weightPct: weights[i],
    quantity: quantities[i],
  }));

  return {
    legs,
    stopLoss: signal.stopLoss,
    totalRiskUsdt: 0,
    side: signal.side,
    asset: signal.asset,
    symbol: `${signal.asset}USDT`,
  };
}
