import { FundingTracker } from "../src/strategy/funding-tracker.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function tracker(fundingRate: number, basisBps: number): FundingTracker {
  const t = new FundingTracker();
  t.update({
    symbol: "BTCUSDT",
    markPrice: 100_000 * (1 + basisBps / 10_000),
    indexPrice: 100_000,
    fundingRate,
    nextFundingTime: Date.now() + 3_600_000,
    timestamp: Date.now(),
  });
  return t;
}

// Long + positive funding + positive basis = crowded long flush
const crowdedLong = tracker(0.0006, 8);
assert(crowdedLong.positioningScore("long") >= 8, "crowded long should score high");
assert(crowdedLong.contradictionPenalty("long") === 0, "aligned long has no penalty");

// Long + negative funding = contradictory
const shortCrowded = tracker(-0.0006, -8);
assert(shortCrowded.positioningScore("long") === 0, "negative funding gives zero long positioning");
assert(shortCrowded.contradictionPenalty("long") > 0, "contradictory long gets penalty");

// Short + negative funding + negative basis = crowded short squeeze
const crowdedShort = tracker(-0.0006, -8);
assert(crowdedShort.positioningScore("short") >= 8, "crowded short should score high");
assert(crowdedShort.contradictionPenalty("short") === 0, "aligned short has no penalty");

// Short + positive funding = contradictory
const longCrowded = tracker(0.0006, 8);
assert(longCrowded.positioningScore("short") === 0, "positive funding gives zero short positioning");
assert(longCrowded.contradictionPenalty("short") > 0, "contradictory short gets penalty");

console.log("funding-tracker.test.ts OK");
