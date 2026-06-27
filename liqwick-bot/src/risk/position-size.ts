export function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const precision = Math.max(0, -Math.floor(Math.log10(step)));
  const rounded = Math.floor(value / step) * step;
  return Number(rounded.toFixed(precision));
}

export function roundToTick(value: number, tick: number): number {
  if (tick <= 0) return value;
  const precision = Math.max(0, -Math.floor(Math.log10(tick)));
  const rounded = Math.round(value / tick) * tick;
  return Number(rounded.toFixed(precision));
}

export interface SymbolFilters {
  stepSize: number;
  tickSize: number;
  minQty: number;
}

export function quantityFromRisk(params: {
  balanceUsdt: number;
  riskPct: number;
  entry: number;
  stopLoss: number;
  filters: SymbolFilters;
  maxNotionalUsdt?: number;
}): number {
  const { balanceUsdt, riskPct, entry, stopLoss, filters, maxNotionalUsdt = 0 } = params;
  const riskUsdt = balanceUsdt * (riskPct / 100);
  const slDistance = Math.abs(entry - stopLoss) / entry;
  if (slDistance <= 0) return 0;

  let notional = riskUsdt / slDistance;
  if (maxNotionalUsdt > 0) notional = Math.min(notional, maxNotionalUsdt);

  const qty = notional / entry;
  const rounded = roundToStep(qty, filters.stepSize);
  return Math.max(rounded, filters.minQty);
}
