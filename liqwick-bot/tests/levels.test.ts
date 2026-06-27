import { buildLevelsFromBars, nearestSupport } from "../src/strategy/levels.js";
import type { KlineBar } from "../src/binance/client.js";

function bar(i: number, l: number, h: number, c: number): KlineBar {
  return { openTime: i, open: c, high: h, low: l, close: c, volume: 1, closeTime: i + 1, closed: true };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const bars5m = [bar(1, 98, 101, 100), bar(2, 99, 102, 101), bar(3, 97, 100, 98)];
const levels = buildLevelsFromBars(bars5m, bars5m, bars5m, [bar(0, 95, 105, 102), bar(1, 96, 104, 100)], 100, 2);
assert(levels.length > 0, "levels built");

const support = nearestSupport(levels, 100);
assert(support !== null, "support found");
assert(support!.price <= 100, "support below price");

console.log("levels.test.ts OK");
