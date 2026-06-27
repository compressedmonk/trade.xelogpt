import { VelocityTracker } from "../src/strategy/velocity.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const v = new VelocityTracker(10_000);
v.add(100, 1000);
v.add(99, 2000);
v.add(98, 3000);
v.add(97, 4000);
v.add(96, 5000);

assert(v.dropFromPeak() > 0.03, "drop from peak");
assert(v.peakPrice() === 100, "peak");
assert(v.troughPrice() === 96, "trough");

console.log("velocity.test.ts OK");
