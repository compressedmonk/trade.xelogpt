import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
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

const dir = mkdtempSync(join(tmpdir(), "wg-exec-"));
const store = new TradeStore(join(dir, "test.db"));

const xpl = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/trades/xpl-limit-unlocked.json"), "utf8"),
);
const signal = parseLimitSignal(xpl.content, xpl.messageId)!;
signal.trader = "Johnny";

const placed = await placeDcaTrade(signal, store);
assert(placed !== null, "placed");
assert(placed!.dryRun, "dry run");

const cancelAlert = parseAlert("🔻 XPL: Limit order cancelled @Johnny")!;
await executeAlert(cancelAlert, store);

const trade = store.findOpenTrade("Johnny", "XPL");
assert(trade === null, "xpl closed after cancel");

store.close();
rmSync(dir, { recursive: true, force: true });

console.log("All executor-dry tests passed.");
