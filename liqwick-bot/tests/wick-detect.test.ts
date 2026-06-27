import { detectIntrabarWick } from "../src/strategy/wick-detect.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const cfg = {
  sweepMinPct: 0.25,
  intrabarMinPct: 0.15,
  velocityPct: 0.2,
  slBufferPct: 0.15,
  tpRMult: 2,
};

const longSignal = detectIntrabarWick({
  regime: "bull",
  symbol: "BTCUSDT",
  barOpen: 100_000,
  currentHigh: 100_100,
  currentLow: 99_600,
  currentPrice: 99_800,
  swingLow: 99_900,
  swingHigh: 100_500,
  dropVelocityPct: 0.5,
  riseVelocityPct: 0,
  config: cfg,
});

assert(longSignal?.side === "long", "expected long");
assert(longSignal!.stopLoss < longSignal!.entryPrice, "SL below entry");

const blockedInBear = detectIntrabarWick({
  regime: "bear",
  symbol: "BTCUSDT",
  barOpen: 100_000,
  currentHigh: 100_100,
  currentLow: 99_600,
  currentPrice: 99_800,
  swingLow: 99_900,
  swingHigh: 100_500,
  dropVelocityPct: 0.5,
  riseVelocityPct: 0,
  config: cfg,
});
assert(blockedInBear === null, "long blocked in bear");

const shortSignal = detectIntrabarWick({
  regime: "bear",
  symbol: "BTCUSDT",
  barOpen: 100_000,
  currentHigh: 100_800,
  currentLow: 99_900,
  currentPrice: 100_400,
  swingLow: 99_000,
  swingHigh: 100_500,
  dropVelocityPct: 0,
  riseVelocityPct: 0.5,
  config: cfg,
});

assert(shortSignal?.side === "short", "expected short");
assert(shortSignal!.stopLoss > shortSignal!.entryPrice, "SL above entry for short");

console.log("wick-detect.test.ts OK");
