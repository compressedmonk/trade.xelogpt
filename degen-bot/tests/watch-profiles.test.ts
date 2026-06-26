import { buildWatchProfiles, parseExtraWatch } from "../src/watch-profiles.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const primaryKey = "1111111111111111111111111111111111111111111111111111111111111111";
const extraKey = "2222222222222222222222222222222222222222222222222222222222222222";

const profiles = buildWatchProfiles(
  new Set(["primary-user"]),
  primaryKey,
  extraKey,
  "extra-a:0.3|extra-b:0.3",
);

assert(profiles.length === 3, "three profiles");
assert(profiles[0]!.buyMode === "full", "primary full mode");
assert(profiles[1]!.buyMode === "fraction" && profiles[1]!.buyFraction === 0.3, "extra-a 30%");
assert(profiles[1]!.walletPrivateKey === extraKey, "shared extra wallet");
assert(profiles[2]!.walletPrivateKey === extraKey, "shared extra wallet");

let threw = false;
try {
  parseExtraWatch("extra:1.5", extraKey, "primary-user");
} catch (e) {
  threw = e instanceof Error && e.message.includes("buyFraction");
}
assert(threw, "fraction > 1 rejected");

console.log("All watch-profiles tests passed.");
