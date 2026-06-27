import { computeAtr } from "../src/strategy/indicators.js";
import type { KlineBar } from "../src/binance/client.js";

function bar(i: number, o: number, h: number, l: number, c: number): KlineBar {
  return { openTime: i, open: o, high: h, low: l, close: c, volume: 1, closeTime: i + 1, closed: true };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const bars: KlineBar[] = [];
let price = 100;
for (let i = 0; i < 30; i++) {
  const move = (i % 5) * 0.5;
  bars.push(bar(i, price, price + 2, price - 2 - move, price + 0.5));
  price += 0.5;
}

const atr = computeAtr(bars, 14);
assert(atr > 0, "ATR should be positive");
assert(atr < 10, "ATR reasonable for test data");

console.log("indicators.test.ts OK");
