import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TradeStore } from "../src/db/store.js";
import { placeDcaTrade } from "../src/executor/place-dca-trade.js";
import { executeAlert } from "../src/executor/alert-actions.js";
import { parseLimitSignal } from "../src/parser/limit-signal.js";
import { parseAlert } from "../src/parser/alert-signal.js";
import { config } from "../src/config.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

config.dryRun = true;
config.followedTraders = ["Johnny"];

const dir = mkdtempSync(join(tmpdir(), "wg-fill-"));
const store = new TradeStore(join(dir, "test.db"));

const xpl = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/trades/xpl-limit-unlocked.json"), "utf8"),
);
const signal = parseLimitSignal(xpl.content, xpl.messageId)!;
signal.trader = "Johnny";

await placeDcaTrade(signal, store);

const fillAlert = parseAlert("🔻 XPL: Limit order filled @Johnny")!;
await executeAlert(fillAlert, store);

let trade = store.findOpenTrade("Johnny", "XPL")!;
assert(trade.legs[0].status === "filled", "L1 filled");
assert(trade.status === "partial_fill", "partial_fill after 1 leg");
assert(trade.slOrderId?.startsWith("dry-sl-"), "SL placed after fill");
assert(trade.avgFillPrice != null, "avg fill set");

await executeAlert(fillAlert, store);
trade = store.findOpenTrade("Johnny", "XPL")!;
assert(trade.legs[1].status === "filled", "L2 filled after 2nd alert");

const moveBe = parseAlert("🔼 XPL: Stops moved to BE @Johnny")!;
await executeAlert(moveBe, store);
trade = store.findOpenTrade("Johnny", "XPL")!;
assert(trade.slOrderId != null, "SL updated after move BE");

const notFollowed = parseLimitSignal(xpl.content, "x2")!;
notFollowed.trader = "Woods";
const skipped = await placeDcaTrade(notFollowed, store);
assert(skipped === null, "Woods not followed → skip");

store.close();
rmSync(dir, { recursive: true, force: true });

console.log("All limit-filled tests passed.");
