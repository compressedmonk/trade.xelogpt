import { parseLimitSignal } from "../src/parser/limit-signal.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const tsla = `@horesz86
TSLA stock short limit entry: 440.36 sl: 514.59 risk: 1%
🔻 LIMIT TSLA | Entry: 440.36 | SL: 514.59 (~ 16.86%) | Risk: 1%
Status: Valid limit order • 2024. 06. 05.`;

const signal = parseLimitSignal(tsla, "tsla-1")!;
assert(signal.asset === "TSLA", "asset");
assert(signal.side === "short", "short");
assert(signal.entryMin === 440.36, "entry");
assert(signal.stopLoss === 514.59, "sl");
assert(signal.status === "valid_limit", "valid");

console.log("All tsla-single-entry tests passed.");
