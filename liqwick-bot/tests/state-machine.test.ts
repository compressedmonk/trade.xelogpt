import { evaluateSweep, initialSweepState } from "../src/strategy/state-machine.js";
import { LiquidationTracker } from "../src/strategy/liquidation-tracker.js";
import { FundingTracker } from "../src/strategy/funding-tracker.js";
import { VelocityTracker } from "../src/strategy/velocity.js";
import type { KlineBar } from "../src/binance/client.js";
import type { SignificantLevel } from "../src/strategy/levels.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const support: SignificantLevel = { price: 100, weight: 2, type: "swing_low", side: "support" };
const levels = [support];
const liq = new LiquidationTracker(10_000);
const funding = new FundingTracker();
const vel = new VelocityTracker(10_000);

function bar(low: number, close: number): KlineBar {
  return {
    openTime: Date.now(),
    open: 100,
    high: 101,
    low,
    close,
    volume: 100,
    quoteVolume: 10000,
    tradeCount: 50,
    takerBuyQuoteVolume: 4000,
    closeTime: Date.now() + 1,
    closed: false,
  };
}

// Start sweep
let state = initialSweepState();
let result = evaluateSweep({
  symbol: "BTCUSDT",
  regime: "bull",
  bar: bar(99.4, 99.8),
  atr: 2,
  levels,
  closedBars: [],
  liqTracker: liq,
  fundingTracker: funding,
  velocity: vel,
  state,
  now: Date.now(),
  entryMode: "knife",
});
assert(result.state.phase === "sweeping", "should enter sweeping");

// Timeout abort
state = result.state;
result = evaluateSweep({
  symbol: "BTCUSDT",
  regime: "bull",
  bar: bar(98, 98.5),
  atr: 2,
  levels,
  closedBars: [],
  liqTracker: liq,
  fundingTracker: funding,
  velocity: vel,
  state,
  now: Date.now() + 20_000,
  entryMode: "knife",
});
const abort = result.events.find((e) => e.type === "sweep_closed");
assert(Boolean(abort), "should close sweep on timeout");
assert(abort!.type === "sweep_closed" && abort.journal.outcome === "aborted_timeout", "timeout outcome");

console.log("state-machine.test.ts OK");
