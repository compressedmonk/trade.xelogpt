#!/usr/bin/env node
/**
 * Sweep journal analysis CLI — read liqwick.db and print optimization report.
 *
 * Usage:
 *   npm run analyze -- --since 2026-06-01 --until 2026-06-28
 *   npm run analyze -- --since 2026-06-01 --csv sweep_journal.csv
 */
import { config as loadEnv } from "dotenv";
import Database from "better-sqlite3";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultDb = resolve(__dirname, "../data/liqwick.db");

function parseArgs(argv) {
  const opts = {
    db: process.env.DB_PATH || defaultDb,
    since: undefined,
    until: undefined,
    symbol: undefined,
    outcome: undefined,
    csv: undefined,
    nearMissMin: Number(process.env.NEAR_MISS_MIN_SCORE || 45),
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--since") opts.since = argv[++i];
    else if (arg === "--until") opts.until = argv[++i];
    else if (arg === "--symbol") opts.symbol = argv[++i]?.toUpperCase();
    else if (arg === "--outcome") opts.outcome = argv[++i];
    else if (arg === "--csv") opts.csv = argv[++i] || "sweep_journal.csv";
    else if (arg === "--db") opts.db = resolve(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: npm run analyze -- [options]

Options:
  --since YYYY-MM-DD     Filter from date (inclusive)
  --until YYYY-MM-DD     Filter to date (inclusive)
  --symbol ETHUSDT       Filter symbol
  --outcome triggered    Filter outcome
  --csv [file]           Export filtered rows to CSV (default: sweep_journal.csv)
  --db path              Database path (default: DB_PATH or data/liqwick.db)
`);
      process.exit(0);
    }
  }
  return opts;
}

function buildWhere(opts) {
  const parts = [];
  const params = [];
  if (opts.since) {
    parts.push("created_at >= ?");
    params.push(opts.since);
  }
  if (opts.until) {
    parts.push("created_at <= ?");
    params.push(opts.until.length <= 10 ? `${opts.until}T23:59:59` : opts.until);
  }
  if (opts.symbol) {
    parts.push("symbol = ?");
    params.push(opts.symbol);
  }
  if (opts.outcome) {
    parts.push("outcome = ?");
    params.push(opts.outcome);
  }
  return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

function pct(n, total) {
  if (!total) return "0%";
  return `${Math.round((n / total) * 1000) / 10}%`;
}

function avg(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => v != null);
  if (!vals.length) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const CSV_COLUMNS = [
  "created_at",
  "symbol",
  "side",
  "outcome",
  "block_reason",
  "peak_score",
  "final_score",
  "depth_atr",
  "max_depth_atr",
  "funding_rate",
  "liq_burst_ratio",
  "reversal_seen",
  "score_reached_threshold",
  "swept_level",
  "extremum",
  "duration_ms",
];

function exportCsv(rows, path) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((col) => csvEscape(row[col])).join(","));
  }
  writeFileSync(path, lines.join("\n") + "\n", "utf8");
  console.log(`CSV written: ${path} (${rows.length} rows)`);
}

const opts = parseArgs(process.argv);

let db;
try {
  db = new Database(opts.db, { readonly: true, fileMustExist: true });
} catch {
  console.error(`Database not found: ${opts.db}`);
  console.error("Start the bot once (npm start) to create the schema, or pass --db path.");
  process.exit(1);
}

const tableExists = db
  .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='sweep_journal'`)
  .get();
if (!tableExists) {
  console.error(`No sweep_journal table in ${opts.db} — run the bot with JOURNAL_ENABLED=true first.`);
  db.close();
  process.exit(1);
}

const { clause, params } = buildWhere(opts);

const rows = db
  .prepare(`SELECT * FROM sweep_journal ${clause} ORDER BY created_at ASC`)
  .all(...params);

if (opts.csv) {
  exportCsv(rows, resolve(opts.csv));
}

const total = rows.length;
console.log("\n=== LiqWick Sweep Journal Analysis ===");
console.log(`Database: ${opts.db}`);
console.log(`Rows: ${total}`);
if (opts.since || opts.until) {
  console.log(`Period: ${opts.since ?? "…"} → ${opts.until ?? "…"}`);
}

if (total === 0) {
  console.log("\nNo sweep journal rows match filters.");
  db.close();
  process.exit(0);
}

const byOutcome = {};
for (const row of rows) {
  byOutcome[row.outcome] = (byOutcome[row.outcome] || 0) + 1;
}

console.log("\n--- Outcome distribution ---");
for (const [outcome, count] of Object.entries(byOutcome).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${outcome.padEnd(24)} ${String(count).padStart(5)}  (${pct(count, total)})`);
}

const continuation = rows.filter((r) => r.outcome === "aborted_continuation");
const timeouts = rows.filter((r) => r.outcome === "aborted_timeout");
const abortTotal = rows.filter(
  (r) => r.outcome.startsWith("aborted_") || r.outcome === "regime_reset",
).length;

console.log("\n--- Abort breakdown ---");
console.log(`  Total aborts/regime_reset: ${abortTotal} (${pct(abortTotal, total)})`);
console.log(`  depth_exceeded (continuation): ${continuation.length} (${pct(continuation.length, total)})`);
console.log(`  timeout: ${timeouts.length} (${pct(timeouts.length, total)})`);
const timeoutReasons = {};
for (const row of timeouts) {
  const reason = row.block_reason || "unknown";
  timeoutReasons[reason] = (timeoutReasons[reason] || 0) + 1;
}
for (const [reason, count] of Object.entries(timeoutReasons).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${reason}: ${count}`);
}

const nearMiss = rows.filter(
  (r) =>
    ["blocked_low_score", "blocked_no_reversal", "aborted_timeout"].includes(r.outcome) &&
    r.peak_score >= opts.nearMissMin,
);
console.log(`\n--- Near misses (peak >= ${opts.nearMissMin}, not triggered) ---`);
console.log(`  Count: ${nearMiss.length} (${pct(nearMiss.length, total)})`);
const nearMissBlocks = {};
for (const row of nearMiss) {
  const key = row.block_reason || row.outcome;
  nearMissBlocks[key] = (nearMissBlocks[key] || 0) + 1;
}
for (const [reason, count] of Object.entries(nearMissBlocks).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${reason}: ${count}`);
}

const triggered = rows.filter((r) => r.outcome === "triggered");
const aborted = rows.filter((r) => r.outcome.startsWith("aborted_"));
console.log("\n--- Peak score averages ---");
console.log(`  All sweeps:        ${avg(rows, "peak_score")}`);
console.log(`  Triggered (${triggered.length}):     ${avg(triggered, "peak_score")}`);
console.log(`  Aborted (${aborted.length}):       ${avg(aborted, "peak_score")}`);
console.log(`  Trigger rate:      ${pct(triggered.length, total)}`);

const bySymbol = {};
for (const row of rows) {
  const s = row.symbol;
  if (!bySymbol[s]) bySymbol[s] = { total: 0, triggered: 0, continuation: 0 };
  bySymbol[s].total++;
  if (row.outcome === "triggered") bySymbol[s].triggered++;
  if (row.outcome === "aborted_continuation") bySymbol[s].continuation++;
}

console.log("\n--- By symbol ---");
for (const [symbol, stats] of Object.entries(bySymbol).sort((a, b) => b[1].total - a[1].total)) {
  console.log(
    `  ${symbol.padEnd(10)} total=${String(stats.total).padStart(4)}  triggered=${String(stats.triggered).padStart(3)} (${pct(stats.triggered, stats.total)})  continuation=${stats.continuation}`,
  );
}

console.log("\n--- Tuning hints ---");
if (continuation.length / total > 0.2) {
  console.log("  • High continuation rate — consider raising SWEEP_ATR_K*4 limit or SWEEP_ATR_K trigger.");
}
if (nearMiss.length / total > 0.15) {
  console.log("  • Many near misses — consider lowering ENTER_THRESHOLD or adjusting REVERSAL_ATR_K.");
}
if (timeouts.length / total > 0.2) {
  console.log("  • Frequent timeouts — consider SWEEP_TIMEOUT_MS or REVERSAL_ATR_K.");
}
if (triggered.length === 0 && total >= 20) {
  console.log("  • No triggers yet — thresholds may be too strict for current market.");
}

console.log("");
db.close();
