import {
  isMessageOlderThan,
  messageAgeMs,
  messageTimestampMs,
  snowflakeFromTimestampMs,
} from "../src/util/snowflake.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
const fourDaysAgo = Date.now() - 4 * 24 * 60 * 60 * 1000;
const id2d = snowflakeFromTimestampMs(twoDaysAgo);
const id4d = snowflakeFromTimestampMs(fourDaysAgo);

assert(messageTimestampMs(id2d) <= twoDaysAgo + 1000, "snowflake round-trip ~2d");
assert(messageAgeMs(id2d) >= 2 * 24 * 60 * 60 * 1000 - 1000, "age ~2d");
assert(!isMessageOlderThan(id2d, 3 * 24 * 60 * 60 * 1000), "2d within 3d window");
assert(isMessageOlderThan(id4d, 3 * 24 * 60 * 60 * 1000), "4d outside 3d window");

console.log("All snowflake tests passed.");
