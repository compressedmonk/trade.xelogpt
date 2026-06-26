import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TradeStore } from "../src/db/store.js";
import { parseLimitSignal } from "../src/parser/limit-signal.js";
import { buildSizedDcaPlan } from "../src/risk/position-size.js";
import { readFileSync } from "node:fs";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const dir = mkdtempSync(join(tmpdir(), "wg-db-"));
const dbPath = join(dir, "test.db");
const store = new TradeStore(dbPath);

const xpl = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/trades/xpl-limit-unlocked.json"), "utf8"),
);
const signal = parseLimitSignal(xpl.content, xpl.messageId)!;
signal.trader = "Johnny";
const plan = buildSizedDcaPlan(signal, 1000);
const trade = store.createTrade(signal, plan);

assert(trade.legs.length === 3, "3 legs stored");
assert(trade.status === "pending_limit", "pending");

const found = store.findOpenTrade("Johnny", "XPL");
assert(found?.id === trade.id, "find by trader+asset");

store.updateTradeStatus(trade.id, "closed");
assert(store.findOpenTrade("Johnny", "XPL") === null, "closed not found");

store.close();
rmSync(dir, { recursive: true, force: true });

console.log("All db-store tests passed.");
