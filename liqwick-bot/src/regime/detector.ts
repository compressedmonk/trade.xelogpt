export type Regime = "bull" | "bear" | "neutral";

export function computeEma(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function detectRegime(
  closes: number[],
  emaPeriod = 200,
  slopeBars = 5,
): Regime {
  if (closes.length < emaPeriod + slopeBars + 1) return "neutral";

  const ema = computeEma(closes, emaPeriod);
  const currentClose = closes[closes.length - 1];
  const emaNow = ema[ema.length - 1];
  const emaPast = ema[ema.length - 1 - slopeBars];

  if (currentClose > emaNow && emaNow > emaPast) return "bull";
  if (currentClose < emaNow && emaNow < emaPast) return "bear";
  return "neutral";
}

export function regimeLabel(r: Regime): string {
  return r === "bull" ? "BULL" : r === "bear" ? "BEAR" : "NEUTRAL";
}
