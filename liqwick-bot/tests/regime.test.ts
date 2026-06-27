import { detectRegime } from "../src/regime/detector.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const bullCloses = Array.from({ length: 220 }, (_, i) => 50_000 + i * 100);
const bearCloses = Array.from({ length: 220 }, (_, i) => 80_000 - i * 120);

assert(detectRegime(bullCloses) === "bull", "expected bull regime");
assert(detectRegime(bearCloses) === "bear", "expected bear regime");
assert(detectRegime([100, 101, 102]) === "neutral", "expected neutral on short series");

console.log("regime.test.ts OK");
