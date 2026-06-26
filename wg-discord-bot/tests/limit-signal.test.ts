import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLimitSignal, isValidForExecution } from "../src/parser/limit-signal.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const fixturesDir = join(process.cwd(), "tests/fixtures/trades");

function loadFixture(name: string): { messageId: string; content: string } {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

const xpl = loadFixture("xpl-limit-unlocked.json");
const xplSignal = parseLimitSignal(xpl.content, xpl.messageId)!;
assert(xplSignal.asset === "XPL", "xpl asset");
assert(xplSignal.side === "long", "xpl long");
assert(xplSignal.entryMax === 0.0782, "xpl entryMax");
assert(xplSignal.entryMin === 0.075, "xpl entryMin");
assert(xplSignal.stopLoss === 0.067, "xpl sl");
assert(xplSignal.riskPct === 2, "xpl risk");
assert(isValidForExecution(xplSignal), "xpl valid");

const btc = loadFixture("btc-limit-clean.json");
const btcSignal = parseLimitSignal(btc.content, btc.messageId)!;
assert(btcSignal.asset === "BTC", "btc asset");
assert(btcSignal.trader === "Johnny", "btc trader");
assert(btcSignal.side === "long", "btc long");
assert(btcSignal.entryMax === 61583, "btc entryMax");

console.log("All limit-signal tests passed.");
