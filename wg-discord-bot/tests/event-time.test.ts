import {
  msgIdFromDiscordLink,
  postedAtFromMsgId,
  postedAtFromRawText,
} from "../src/util/event-time.js";
import { snowflakeFromTimestampMs } from "../src/util/snowflake.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const ts = Date.parse("2026-06-10T12:00:00.000Z");
const id = snowflakeFromTimestampMs(ts);
assert(postedAtFromMsgId(id) !== null, "postedAt from snowflake");

const raw =
  "[**HYPE**](https://discord.com/channels/742797926761234463/1026871730964271134/1514347426981478690): Stopped out";
assert(msgIdFromDiscordLink(raw) === "1514347426981478690", "link parse");
assert(postedAtFromRawText(raw) !== null, "postedAt from link");

console.log("All event-time tests passed.");
