import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseAlert, shouldExecuteAlert } from "../src/parser/alert-signal.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function load(name: string): string {
  return JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/alerts", name), "utf8")).content;
}

const stoppedBe = parseAlert(load("stopped-be-btc.json"))!;
assert(stoppedBe.actions[0].type === "immediate_close", "stopped be");
assert((stoppedBe.actions[0] as { closePct: number }).closePct === 100, "stopped be 100%");

const moveSl = parseAlert(load("move-sl-near.json"))!;
assert(moveSl.actions[0].type === "skip", "woods not followed");

process.env.FOLLOWED_TRADERS = "Johnny,Woods,-Tareeq,Astekz";
const { config } = await import("../src/config.js");
config.followedTraders = ["Johnny", "Woods", "-Tareeq", "Astekz"];

const moveSl2 = parseAlert(load("move-sl-near.json"))!;
assert(moveSl2.actions[0].type === "move_sl", "move sl near");
assert((moveSl2.actions[0] as { newSl: number }).newSl === 1.88, "sl 1.88");

const tp1 = parseAlert(load("tp1-velvet-50.json"))!;
assert(tp1.actions[0].type === "immediate_close", "tp1");
assert((tp1.actions[0] as { closePct: number }).closePct === 50, "tp1 50%");

const combo = parseAlert(load("tp1-near-25-be-combo.json"))!;
assert(combo.actions.length === 2, "combo 2 actions");
assert(combo.actions[0].type === "immediate_close", "combo close");
assert(combo.actions[1].type === "move_sl", "combo move sl");

const goog = parseAlert(load("skip-goog-stock.json"))!;
assert(goog.actions[0].type === "skip", "goog skip");
assert(!shouldExecuteAlert(goog), "goog not execute");

const velvet30 = parseAlert(load("close-velvet-30.json"))!;
assert((velvet30.actions[0] as { closePct: number }).closePct === 30, "velvet 30%");

const filled = parseAlert(load("limit-filled-btc.json"))!;
assert(filled.actions[0].type === "limit_filled", "limit filled");

const hype = parseAlert(load("close-hype-100.json"))!;
assert((hype.actions[0] as { closePct: number }).closePct === 100, "hype 100%");

const fixtures = readdirSync(join(process.cwd(), "tests/fixtures/alerts")).filter((f) =>
  f.endsWith(".json"),
);
assert(fixtures.length === 8, "8 alert fixtures");

console.log("All alert-signal tests passed.");
