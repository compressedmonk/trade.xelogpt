/**
 * Binance testnet E2E — skipped unless BINANCE_E2E=1 and API keys set.
 * Validates client connectivity and DCA dry-run pipeline without live orders by default.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../src/config.js";
import { BinanceFuturesClient } from "../src/binance/client.js";
import { parseLimitSignal } from "../src/parser/limit-signal.js";
import { buildSizedDcaPlan } from "../src/risk/position-size.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const xpl = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/trades/xpl-limit-unlocked.json"), "utf8"),
);
const signal = parseLimitSignal(xpl.content, xpl.messageId)!;
const plan = buildSizedDcaPlan(signal, config.defaultBalanceUsdt);
assert(plan.legs.length === 3, "plan has 3 legs");

if (process.env.BINANCE_E2E !== "1") {
  console.log("Binance E2E skipped (set BINANCE_E2E=1 to run against testnet)");
  process.exit(0);
}

if (!config.binanceApiKey || !config.binanceApiSecret) {
  console.log("Binance E2E skipped (missing BINANCE_API_KEY / BINANCE_API_SECRET)");
  process.exit(0);
}

const client = new BinanceFuturesClient();
const balance = await client.getBalanceUsdt();
console.log(`Testnet balance: ${balance} USDT`);

const info = await client.getExchangeInfo("BTCUSDT");
assert(info !== null, "BTCUSDT listed on testnet");

const cancelAlert = "🔻 BTC: Limit order cancelled @Johnny";
assert(cancelAlert.includes("cancelled"), "cancel alert fixture sanity");

console.log("Binance E2E connectivity OK.");
