import { scoreConfluence } from "../src/strategy/confluence.js";
import { LiquidationTracker } from "../src/strategy/liquidation-tracker.js";
import { FundingTracker } from "../src/strategy/funding-tracker.js";
import { VelocityTracker } from "../src/strategy/velocity.js";
import type { KlineBar } from "../src/binance/client.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const bar: KlineBar = {
  openTime: 1,
  open: 100,
  high: 101,
  low: 94,
  close: 98,
  volume: 1000,
  quoteVolume: 100000,
  tradeCount: 500,
  takerBuyQuoteVolume: 30000,
  closeTime: 2,
  closed: false,
};

const liq = new LiquidationTracker(10_000);
liq.add({ symbol: "BTCUSDT", side: "SELL", price: 95, quantity: 1, timestamp: Date.now() });
liq.add({ symbol: "BTCUSDT", side: "SELL", price: 94.5, quantity: 2, timestamp: Date.now() });

const funding = new FundingTracker();
funding.update({
  symbol: "BTCUSDT",
  markPrice: 100_008,
  indexPrice: 100_000,
  fundingRate: 0.0005,
  nextFundingTime: Date.now() + 3_600_000,
  timestamp: Date.now(),
});

const vel = new VelocityTracker(10_000);
vel.add(100, Date.now() - 5000);
vel.add(94, Date.now());

const score = scoreConfluence({
  side: "long",
  bar,
  atr: 2,
  sweptLevel: { price: 96, weight: 2, type: "swing_low", side: "support" },
  sweepExtremum: 94,
  liqTracker: liq,
  fundingTracker: funding,
  velocity: vel,
  closedBars: [bar],
  volBaseline: { quoteVolumeAvg: 50000, tradeCountAvg: 200 },
});

assert(score.total > 0, "score positive");
assert(score.total <= 100, "score capped at 100");
assert(score.liquidation >= 0, "liq component");
assert(typeof score.positioning === "number", "positioning component present");
assert(score.positioning >= 0 && score.positioning <= 10, "positioning in range");
assert(
  score.liquidation + score.sweep + score.velocity + score.geometry + score.volume + score.delta + score.positioning <= 100,
  "component sum within max weights",
);

console.log("confluence.test.ts OK", score);
