import { classifySweepOutcome } from "../src/strategy/sweep-journal.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const low = classifySweepOutcome({
  scoreReachedThreshold: false,
  reversalSeen: false,
  peakScore: 40,
  enterThreshold: 60,
  hadEnterSignal: false,
});
assert(low.outcome === "blocked_low_score", "low score");

const noRev = classifySweepOutcome({
  scoreReachedThreshold: true,
  reversalSeen: false,
  peakScore: 65,
  enterThreshold: 60,
  hadEnterSignal: false,
});
assert(noRev.outcome === "blocked_no_reversal", "no reversal");

const timeout = classifySweepOutcome({
  abortReason: "timeout",
  scoreReachedThreshold: true,
  reversalSeen: false,
  peakScore: 62,
  enterThreshold: 60,
  hadEnterSignal: false,
});
assert(timeout.outcome === "aborted_timeout", "timeout");

console.log("sweep-journal.test.ts OK");
