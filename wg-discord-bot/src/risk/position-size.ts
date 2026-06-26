import type { ParsedLimitSignal } from "../parser/types.js";
import { buildDcaLadder, type DcaPlan } from "../execution/dca-ladder.js";
import { config } from "../config.js";

export interface SymbolFilters {
  stepSize: number;
  tickSize: number;
  minQty: number;
}

export function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const precision = Math.max(0, -Math.floor(Math.log10(step)));
  const rounded = Math.floor(value / step) * step;
  return Number(rounded.toFixed(precision));
}

export function legQuantitiesFromTotalRisk(
  signal: ParsedLimitSignal,
  balanceUsdt: number,
  weights: number[],
  filters?: SymbolFilters,
): number[] {
  const totalRiskUsdt = balanceUsdt * (signal.riskPct / 100);
  const step = filters?.stepSize ?? 0.001;
  const minQty = filters?.minQty ?? step;

  let prices: number[];
  if (signal.side === "long") {
    prices = [
      signal.entryMax,
      (signal.entryMax + signal.entryMin) / 2,
      signal.entryMin,
    ];
  } else {
    prices = [
      signal.entryMin,
      (signal.entryMin + signal.entryMax) / 2,
      signal.entryMax,
    ];
  }

  return prices.map((price, i) => {
    const legRiskUsdt = totalRiskUsdt * (weights[i] / 100);
    const slDistance = Math.abs(price - signal.stopLoss) / price;
    if (slDistance <= 0) return 0;
    const notional = legRiskUsdt / slDistance;
    const qty = notional / price;
    const rounded = roundToStep(qty, step);
    return Math.max(rounded, minQty);
  });
}

export function buildSizedDcaPlan(
  signal: ParsedLimitSignal,
  balanceUsdt: number,
  filters?: SymbolFilters,
): DcaPlan {
  const weights = config.dcaWeights;
  const quantities = legQuantitiesFromTotalRisk(signal, balanceUsdt, weights, filters);
  const plan = buildDcaLadder(signal, quantities);
  plan.totalRiskUsdt = balanceUsdt * (signal.riskPct / 100);
  return plan;
}
