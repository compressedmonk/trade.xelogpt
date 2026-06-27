import { swingLevelsFromClosedBars } from "../src/strategy/swing-levels.js";
import type { KlineBar } from "../src/binance/client.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const bars: KlineBar[] = [
  { openTime: 1, open: 100, high: 101, low: 99, close: 100.5, volume: 1, closeTime: 2, closed: true },
  { openTime: 3, open: 100.5, high: 102, low: 98, close: 101, volume: 1, closeTime: 4, closed: true },
  { openTime: 5, open: 101, high: 103, low: 97, close: 102, volume: 1, closeTime: 6, closed: true },
];

const levels = swingLevelsFromClosedBars(bars, 3);
assert(levels.swingLow === 97, "swing low");
assert(levels.swingHigh === 103, "swing high");

console.log("swing-levels.test.ts OK");
