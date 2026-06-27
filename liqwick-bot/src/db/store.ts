import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import type { Regime } from "../regime/detector.js";
import type { BotStatus, SymbolMonitorSnapshot, StreamHealth } from "../strategy/types.js";
import type { ConfluenceBreakdown } from "../strategy/confluence.js";
import type { SweepJournalEntry } from "../strategy/sweep-journal.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface JournalFilter {
  since?: string;
  until?: string;
  symbol?: string;
  outcome?: string;
  side?: string;
}

export interface OptimizationStats {
  totalSweeps: number;
  triggered: number;
  nearMiss: number;
  aborts: number;
  avgPeakScore: number;
  byOutcome: Record<string, number>;
}

export interface WeeklyOptimizationBucket {
  weekStart: string;
  totalSweeps: number;
  triggered: number;
  aborts: number;
  avgPeakScore: number;
  byOutcome: Record<string, number>;
}

function buildJournalWhere(filter: JournalFilter = {}): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (filter.since) {
    parts.push(`created_at >= ?`);
    params.push(filter.since);
  }
  if (filter.until) {
    parts.push(`created_at <= ?`);
    params.push(filter.until);
  }
  if (filter.symbol) {
    parts.push(`symbol = ?`);
    params.push(filter.symbol.toUpperCase());
  }
  if (filter.outcome) {
    parts.push(`outcome = ?`);
    params.push(filter.outcome);
  }
  if (filter.side) {
    parts.push(`side = ?`);
    params.push(filter.side.toLowerCase());
  }
  const clause = parts.length > 0 ? `WHERE ${parts.join(" AND ")}` : "";
  return { clause, params };
}

export interface StoredPosition {
  id: string;
  symbol: string;
  side: "long" | "short";
  status: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  takeProfit1?: number;
  quantity: number;
  regime: Regime;
  reason: string;
  score?: number;
  dryRun: boolean;
  entryOrderId?: string;
  slOrderId?: string;
  tpOrderId?: string;
  tp1OrderId?: string;
  createdAt: string;
  closedAt?: string;
}

export class BotStore {
  private db: Database.Database;

  constructor(dbPath = config.dbPath) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");
    this.db.exec(schema);
    this.migrate();
  }

  private migrate(): void {
    const addCol = (table: string, col: string, type: string) => {
      const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      if (!cols.some((c) => c.name === col)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      }
    };
    addCol("signal_events", "confluence_score", "INTEGER");
    addCol("signal_events", "score_breakdown", "TEXT");
    addCol("signal_events", "take_profit1", "REAL");
    addCol("positions", "take_profit1", "REAL");
    addCol("positions", "confluence_score", "INTEGER");
    addCol("positions", "tp1_order_id", "TEXT");
    addCol("positions", "sl_at_breakeven", "INTEGER NOT NULL DEFAULT 0");
  }

  close(): void {
    this.db.close();
  }

  setState(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO bot_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      )
      .run(key, value);
  }

  getState(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM bot_state WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setRegime(regime: Regime): void {
    this.setState("regime", regime);
    this.setState("regime_updated_at", new Date().toISOString());
  }

  getRegime(): Regime {
    const v = this.getState("regime");
    if (v === "bull" || v === "bear" || v === "neutral") return v;
    return "neutral";
  }

  setCooldown(symbol: string): void {
    const until = Date.now() + config.tradeCooldownMs;
    this.db
      .prepare(
        `INSERT INTO symbol_cooldowns (symbol, until_ms) VALUES (?, ?)
         ON CONFLICT(symbol) DO UPDATE SET until_ms = excluded.until_ms`,
      )
      .run(symbol, until);
  }

  setAbortCooldown(symbol: string): void {
    const until = Date.now() + config.abortCooldownMs;
    this.db
      .prepare(
        `INSERT INTO symbol_cooldowns (symbol, until_ms) VALUES (?, ?)
         ON CONFLICT(symbol) DO UPDATE SET until_ms = excluded.until_ms`,
      )
      .run(symbol, until);
  }

  isOnCooldown(symbol: string): boolean {
    const row = this.db
      .prepare(`SELECT until_ms FROM symbol_cooldowns WHERE symbol = ?`)
      .get(symbol) as { until_ms: number } | undefined;
    return row ? row.until_ms > Date.now() : false;
  }

  hasOpenPosition(symbol: string): boolean {
    const row = this.db
      .prepare(`SELECT id FROM positions WHERE symbol = ? AND status = 'active' LIMIT 1`)
      .get(symbol);
    return Boolean(row);
  }

  countOpenPositions(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS c FROM positions WHERE status = 'active'`)
      .get() as { c: number };
    return row.c;
  }

  logSignal(params: {
    id: string;
    symbol: string;
    side: "long" | "short";
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    takeProfit1: number;
    quantity: number;
    regime: Regime;
    reason: string;
    score: number;
    scoreBreakdown: ConfluenceBreakdown;
    dryRun: boolean;
  }): void {
    this.db
      .prepare(
        `INSERT INTO signal_events (
          id, symbol, side, entry_price, stop_loss, take_profit, take_profit1, quantity,
          regime, reason, confluence_score, score_breakdown, dry_run
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.id,
        params.symbol,
        params.side,
        params.entryPrice,
        params.stopLoss,
        params.takeProfit,
        params.takeProfit1,
        params.quantity,
        params.regime,
        params.reason,
        params.score,
        JSON.stringify(params.scoreBreakdown),
        params.dryRun ? 1 : 0,
      );
    this.logEvent(params.id, "signal", params);
  }

  createPosition(params: {
    id: string;
    symbol: string;
    side: "long" | "short";
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    takeProfit1: number;
    quantity: number;
    regime: Regime;
    reason: string;
    score: number;
    dryRun: boolean;
    entryOrderId?: string;
    slOrderId?: string;
    tpOrderId?: string;
    tp1OrderId?: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO positions (
          id, symbol, side, status, entry_price, stop_loss, take_profit, take_profit1, quantity,
          regime, signal_reason, confluence_score, dry_run, entry_order_id, sl_order_id, tp_order_id, tp1_order_id
        ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.id,
        params.symbol,
        params.side,
        params.entryPrice,
        params.stopLoss,
        params.takeProfit,
        params.takeProfit1,
        params.quantity,
        params.regime,
        params.reason,
        params.score,
        params.dryRun ? 1 : 0,
        params.entryOrderId ?? null,
        params.slOrderId ?? null,
        params.tpOrderId ?? null,
        params.tp1OrderId ?? null,
      );
    this.logEvent(params.id, "position_opened", params);
  }

  closePosition(id: string): void {
    this.db
      .prepare(`UPDATE positions SET status = 'closed', closed_at = datetime('now') WHERE id = ?`)
      .run(id);
    this.logEvent(id, "position_closed", {});
  }

  updateStopLoss(id: string, stopLoss: number, slOrderId?: string): void {
    if (slOrderId) {
      this.db
        .prepare(`UPDATE positions SET stop_loss = ?, sl_order_id = ? WHERE id = ?`)
        .run(stopLoss, slOrderId, id);
    } else {
      this.db.prepare(`UPDATE positions SET stop_loss = ? WHERE id = ?`).run(stopLoss, id);
    }
  }

  markSlAtBreakeven(id: string): void {
    this.db.prepare(`UPDATE positions SET sl_at_breakeven = 1 WHERE id = ?`).run(id);
  }

  isSlAtBreakeven(id: string): boolean {
    const row = this.db
      .prepare(`SELECT sl_at_breakeven FROM positions WHERE id = ?`)
      .get(id) as { sl_at_breakeven: number } | undefined;
    return Boolean(row?.sl_at_breakeven);
  }

  logEvent(tradeId: string | null, eventType: string, payload?: unknown): void {
    this.db
      .prepare(`INSERT INTO bot_events (trade_id, event_type, payload) VALUES (?, ?, ?)`)
      .run(tradeId, eventType, payload ? JSON.stringify(payload) : null);
  }

  logSweepJournal(entry: SweepJournalEntry): void {
    this.db
      .prepare(
        `INSERT INTO sweep_journal (
          id, symbol, side, regime, outcome, block_reason, swept_level, level_type, extremum,
          depth_atr, max_depth_atr, atr, duration_ms, peak_score, final_score, enter_threshold,
          score_breakdown, funding_rate, basis_bps, liq_burst_ratio, reversal_seen,
          score_reached_threshold, entry_price, stop_loss, take_profit1, take_profit2, signal_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.sweepId,
        entry.symbol,
        entry.side,
        entry.regime,
        entry.outcome,
        entry.blockReason ?? null,
        entry.sweptLevel,
        entry.levelType,
        entry.extremum,
        entry.depthAtr,
        entry.maxDepthAtr,
        entry.atr,
        entry.durationMs,
        entry.peakScore,
        entry.finalScore,
        entry.enterThreshold,
        entry.scoreBreakdown ? JSON.stringify(entry.scoreBreakdown) : null,
        entry.fundingRate,
        entry.basisBps,
        entry.liqBurstRatio,
        entry.reversalSeen ? 1 : 0,
        entry.scoreReachedThreshold ? 1 : 0,
        entry.entryPrice ?? null,
        entry.stopLoss ?? null,
        entry.takeProfit1 ?? null,
        entry.takeProfit2 ?? null,
        entry.signalId ?? null,
      );
  }

  listSweepJournal(limit = 100, filter: JournalFilter = {}) {
    const { clause, params } = buildJournalWhere(filter);
    return this.db
      .prepare(`SELECT * FROM sweep_journal ${clause} ORDER BY created_at DESC LIMIT ?`)
      .all(...params, limit) as Record<string, unknown>[];
  }

  getOptimizationStats(filter: JournalFilter = {}): OptimizationStats {
    const { clause, params } = buildJournalWhere(filter);
    const extra = clause ? `${clause} AND` : "WHERE";

    const total = this.db
      .prepare(`SELECT COUNT(*) AS c FROM sweep_journal ${clause}`)
      .get(...params) as { c: number };
    const triggered = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM sweep_journal ${extra} outcome = 'triggered'`,
      )
      .get(...params) as { c: number };
    const nearMiss = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM sweep_journal ${extra} outcome IN ('blocked_low_score','blocked_no_reversal','aborted_timeout')
         AND peak_score >= ?`,
      )
      .get(...params, config.nearMissMinScore) as { c: number };
    const aborts = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM sweep_journal ${extra} (outcome LIKE 'aborted_%' OR outcome = 'regime_reset')`,
      )
      .get(...params) as { c: number };
    const avg = this.db
      .prepare(`SELECT AVG(peak_score) AS a FROM sweep_journal ${clause}`)
      .get(...params) as { a: number | null };
    const rows = this.db
      .prepare(`SELECT outcome, COUNT(*) AS c FROM sweep_journal ${clause} GROUP BY outcome`)
      .all(...params) as Array<{ outcome: string; c: number }>;
    const byOutcome: Record<string, number> = {};
    for (const row of rows) byOutcome[row.outcome] = row.c;
    return {
      totalSweeps: total.c,
      triggered: triggered.c,
      nearMiss: nearMiss.c,
      aborts: aborts.c,
      avgPeakScore: Math.round((avg.a ?? 0) * 10) / 10,
      byOutcome,
    };
  }

  getOptimizationWeekly(filter: JournalFilter = {}): WeeklyOptimizationBucket[] {
    const { clause, params } = buildJournalWhere(filter);
    const weekRows = this.db
      .prepare(
        `SELECT
           date(created_at, 'weekday 0', '-6 days') AS week_start,
           COUNT(*) AS total,
           AVG(peak_score) AS avg_peak,
           SUM(CASE WHEN outcome = 'triggered' THEN 1 ELSE 0 END) AS triggered,
           SUM(CASE WHEN outcome LIKE 'aborted_%' OR outcome = 'regime_reset' THEN 1 ELSE 0 END) AS aborts
         FROM sweep_journal ${clause}
         GROUP BY week_start
         ORDER BY week_start DESC`,
      )
      .all(...params) as Array<{
      week_start: string;
      total: number;
      avg_peak: number | null;
      triggered: number;
      aborts: number;
    }>;

    const outcomeRows = this.db
      .prepare(
        `SELECT
           date(created_at, 'weekday 0', '-6 days') AS week_start,
           outcome,
           COUNT(*) AS c
         FROM sweep_journal ${clause}
         GROUP BY week_start, outcome`,
      )
      .all(...params) as Array<{ week_start: string; outcome: string; c: number }>;

    const byWeekOutcome = new Map<string, Record<string, number>>();
    for (const row of outcomeRows) {
      const map = byWeekOutcome.get(row.week_start) ?? {};
      map[row.outcome] = row.c;
      byWeekOutcome.set(row.week_start, map);
    }

    return weekRows.map((row) => ({
      weekStart: row.week_start,
      totalSweeps: row.total,
      triggered: row.triggered,
      aborts: row.aborts,
      avgPeakScore: Math.round((row.avg_peak ?? 0) * 10) / 10,
      byOutcome: byWeekOutcome.get(row.week_start) ?? {},
    }));
  }

  listPositions(limit = 50): StoredPosition[] {
    const rows = this.db
      .prepare(`SELECT * FROM positions ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as Record<string, unknown>[];
    return rows.map(mapPosition);
  }

  listSignals(limit = 50) {
    return this.db
      .prepare(`SELECT * FROM signal_events ORDER BY created_at DESC LIMIT ?`)
      .all(limit);
  }

  listEvents(limit = 100) {
    const rows = this.db
      .prepare(`SELECT id, trade_id, event_type, payload, created_at FROM bot_events ORDER BY id DESC LIMIT ?`)
      .all(limit) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as number,
      tradeId: (r.trade_id as string) || null,
      eventType: r.event_type as string,
      payload: r.payload ? JSON.parse(r.payload as string) : null,
      createdAt: r.created_at as string,
    }));
  }

  summary(): { open: number; closed: number; signals: number; events: number } {
    const open = this.db
      .prepare(`SELECT COUNT(*) AS c FROM positions WHERE status = 'active'`)
      .get() as { c: number };
    const closed = this.db
      .prepare(`SELECT COUNT(*) AS c FROM positions WHERE status = 'closed'`)
      .get() as { c: number };
    const signals = this.db.prepare(`SELECT COUNT(*) AS c FROM signal_events`).get() as { c: number };
    const events = this.db.prepare(`SELECT COUNT(*) AS c FROM bot_events`).get() as { c: number };
    return { open: open.c, closed: closed.c, signals: signals.c, events: events.c };
  }

  getStatus(
    symbols: string[],
    monitors: SymbolMonitorSnapshot[] = [],
    circuitBreaker = { dailyLossUsdt: 0, tradesToday: 0 },
    streamHealth?: StreamHealth,
  ): BotStatus {
    return {
      regime: this.getRegime(),
      regimeUpdatedAt: this.getState("regime_updated_at"),
      dryRun: config.dryRun,
      symbols,
      lastScanAt: this.getState("last_scan_at"),
      signalsToday: this.summary().signals,
      openPositions: this.summary().open,
      monitors,
      circuitBreaker,
      streamHealth,
      optimization: this.getOptimizationStats(),
      testnet: config.binanceTestnet,
      enterThreshold: config.enterThreshold,
    };
  }
}

function mapPosition(row: Record<string, unknown>): StoredPosition {
  return {
    id: row.id as string,
    symbol: row.symbol as string,
    side: row.side as "long" | "short",
    status: row.status as string,
    entryPrice: row.entry_price as number,
    stopLoss: row.stop_loss as number,
    takeProfit: row.take_profit as number,
    takeProfit1: (row.take_profit1 as number) || undefined,
    quantity: row.quantity as number,
    regime: row.regime as Regime,
    reason: row.signal_reason as string,
    score: (row.confluence_score as number) || undefined,
    dryRun: Boolean(row.dry_run),
    entryOrderId: (row.entry_order_id as string) || undefined,
    slOrderId: (row.sl_order_id as string) || undefined,
    tpOrderId: (row.tp_order_id as string) || undefined,
    tp1OrderId: (row.tp1_order_id as string) || undefined,
    createdAt: row.created_at as string,
    closedAt: (row.closed_at as string) || undefined,
  };
}
