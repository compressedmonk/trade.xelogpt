import { parseLimitSignal } from "../src/parser/limit-signal.js";
import { buildSizedDcaPlan } from "../src/risk/position-size.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const xpl = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/trades/xpl-limit-unlocked.json"), "utf8"),
);
const signal = parseLimitSignal(xpl.content, xpl.messageId)!;
const plan = buildSizedDcaPlan(signal, 1000);

assert(plan.legs.length === 3, "3 legs");
assert(plan.legs[0].weightPct === 25, "L1 weight 25");
assert(plan.legs[1].weightPct === 35, "L2 weight 35");
assert(plan.legs[2].weightPct === 40, "L3 weight 40");
assert(Math.abs(plan.legs[0].price - 0.0782) < 1e-6, "L1 price upper");
assert(Math.abs(plan.legs[2].price - 0.075) < 1e-6, "L3 price lower");
assert(Math.abs(plan.totalRiskUsdt - 20) < 0.01, "total risk 2% of 1000");

const mid = (0.0782 + 0.075) / 2;
assert(Math.abs(plan.legs[1].price - mid) < 1e-6, "L2 mid price");

let totalLegRisk = 0;
for (const leg of plan.legs) {
  const slDist = Math.abs(leg.price - signal.stopLoss) / leg.price;
  totalLegRisk += leg.quantity * leg.price * slDist;
}
assert(Math.abs(totalLegRisk - 20) < 2, "aggregated leg risk ≈ totalRiskUsdt");

console.log("All dca-ladder tests passed.");
