import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { DcaPlan } from "../execution/dca-ladder.js";
import type { ParsedLimitSignal } from "../parser/types.js";
import { msgTiming } from "../util/event-time.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type TradeStatus = "pending_limit" | "partial_fill" | "active" | "closed";
export type LegStatus = "pending" | "filled" | "cancelled";

export interface TradeLeg {
  step: number;
  limitPrice: number;
  quantity: number;
  weightPct: number;
  orderId?: string;
  status: LegStatus;
  fillPrice?: number;
}

export interface OpenTrade {
  id: string;
  trader: string;
  asset: string;
  symbol: string;
  side: "long" | "short";
  signalEntryMin: number;
  signalEntryMax: number;
  signalStopLoss: number;
  signalRiskPct: number;
  status: TradeStatus;
  legs: TradeLeg[];
  slOrderId?: string;
  avgFillPrice?: number;
  discordSignalMsgId: string;
  createdAt?: string;
  updatedAt?: string;
}

export class TradeStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");
    this.db.exec(schema);
  }

  close(): void {
    this.db.close();
  }

  createTrade(signal: ParsedLimitSignal, plan: DcaPlan): OpenTrade {
    const id = randomUUID();
    const trader = signal.trader || "unknown";

    const insertTrade = this.db.prepare(`
      INSERT INTO open_trades (
        id, trader, asset, symbol, side,
        signal_entry_min, signal_entry_max, signal_stop_loss, signal_risk_pct,
        status, discord_signal_msg_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_limit', ?)
    `);

    const insertLeg = this.db.prepare(`
      INSERT INTO trade_legs (trade_id, step, limit_price, quantity, weight_pct, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `);

    const tx = this.db.transaction(() => {
      insertTrade.run(
        id,
        trader,
        signal.asset,
        plan.symbol,
        signal.side,
        signal.entryMin,
        signal.entryMax,
        signal.stopLoss,
        signal.riskPct,
        signal.sourceMessageId,
      );
      for (const leg of plan.legs) {
        insertLeg.run(id, leg.step, leg.price, leg.quantity, leg.weightPct);
      }
    });
    tx();

    this.logEvent(id, "trade_created", {
      asset: signal.asset,
      trader,
      ...msgTiming(signal.sourceMessageId),
    });
    return this.getTradeById(id)!;
  }

  findOpenTrade(trader: string, asset: string): OpenTrade | null {
    const row = this.db
      .prepare(
        `SELECT id FROM open_trades
         WHERE trader = ? AND asset = ? AND status IN ('pending_limit', 'partial_fill', 'active')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(trader, asset) as { id: string } | undefined;
    return row ? this.getTradeById(row.id) : null;
  }

  /** Most recent journal row for trader+asset, any status (for alert reasoning). */
  findLatestTrade(trader: string, asset: string): OpenTrade | null {
    const normalized = trader.trim() || "unknown";
    const row =
      normalized === "unknown"
        ? (this.db
            .prepare(
              `SELECT id FROM open_trades WHERE asset = ? ORDER BY created_at DESC LIMIT 1`,
            )
            .get(asset) as { id: string } | undefined)
        : (this.db
            .prepare(
              `SELECT id FROM open_trades WHERE trader = ? AND asset = ? ORDER BY created_at DESC LIMIT 1`,
            )
            .get(normalized, asset) as { id: string } | undefined);
    return row ? this.getTradeById(row.id) : null;
  }

  getTradeById(id: string): OpenTrade | null {
    const trade = this.db
      .prepare(`SELECT * FROM open_trades WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    if (!trade) return null;

    const legs = this.db
      .prepare(`SELECT * FROM trade_legs WHERE trade_id = ? ORDER BY step`)
      .all(id) as Record<string, unknown>[];

    return {
      id: trade.id as string,
      trader: trade.trader as string,
      asset: trade.asset as string,
      symbol: trade.symbol as string,
      side: trade.side as "long" | "short",
      signalEntryMin: trade.signal_entry_min as number,
      signalEntryMax: trade.signal_entry_max as number,
      signalStopLoss: trade.signal_stop_loss as number,
      signalRiskPct: trade.signal_risk_pct as number,
      status: trade.status as TradeStatus,
      slOrderId: (trade.sl_order_id as string) || undefined,
      avgFillPrice: (trade.avg_fill_price as number) || undefined,
      discordSignalMsgId: trade.discord_signal_msg_id as string,
      createdAt: trade.created_at as string,
      updatedAt: trade.updated_at as string,
      legs: legs.map((l) => ({
        step: l.step as number,
        limitPrice: l.limit_price as number,
        quantity: l.quantity as number,
        weightPct: l.weight_pct as number,
        orderId: (l.order_id as string) || undefined,
        status: l.status as LegStatus,
        fillPrice: (l.fill_price as number) || undefined,
      })),
    };
  }

  updateTradeStatus(id: string, status: TradeStatus): void {
    this.db
      .prepare(`UPDATE open_trades SET status = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(status, id);
  }

  setLegOrderId(tradeId: string, step: number, orderId: string): void {
    this.db
      .prepare(`UPDATE trade_legs SET order_id = ? WHERE trade_id = ? AND step = ?`)
      .run(orderId, tradeId, step);
  }

  setLegStatus(tradeId: string, step: number, status: LegStatus, fillPrice?: number): void {
    this.db
      .prepare(
        `UPDATE trade_legs SET status = ?, fill_price = COALESCE(?, fill_price) WHERE trade_id = ? AND step = ?`,
      )
      .run(status, fillPrice ?? null, tradeId, step);
  }

  setSlOrderId(tradeId: string, orderId: string): void {
    this.db
      .prepare(`UPDATE open_trades SET sl_order_id = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(orderId, tradeId);
  }

  clearSlOrderId(tradeId: string): void {
    this.db
      .prepare(`UPDATE open_trades SET sl_order_id = NULL, updated_at = datetime('now') WHERE id = ?`)
      .run(tradeId);
  }

  setAvgFillPrice(tradeId: string, price: number): void {
    this.db
      .prepare(`UPDATE open_trades SET avg_fill_price = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(price, tradeId);
  }

  logEvent(tradeId: string | null, eventType: string, payload?: unknown): void {
    this.db
      .prepare(`INSERT INTO trade_events (trade_id, event_type, payload) VALUES (?, ?, ?)`)
      .run(tradeId, eventType, payload ? JSON.stringify(payload) : null);
  }

  listTrades(options?: { status?: TradeStatus | "open" | "all"; limit?: number }): OpenTrade[] {
    const limit = options?.limit ?? 100;
    let sql = `SELECT id FROM open_trades`;
    const params: unknown[] = [];

    if (options?.status === "open") {
      sql += ` WHERE status IN ('pending_limit', 'partial_fill', 'active')`;
    } else if (options?.status && options.status !== "all") {
      sql += ` WHERE status = ?`;
      params.push(options.status);
    }

    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as { id: string }[];
    return rows.map((r) => this.getTradeById(r.id)!);
  }

  listEvents(limit = 100, tradeId?: string): Array<{
    id: number;
    tradeId: string | null;
    eventType: string;
    payload: unknown;
    createdAt: string;
  }> {
    const sql = tradeId
      ? `SELECT id, trade_id, event_type, payload, created_at FROM trade_events WHERE trade_id = ? ORDER BY id DESC LIMIT ?`
      : `SELECT id, trade_id, event_type, payload, created_at FROM trade_events ORDER BY id DESC LIMIT ?`;
    const params = tradeId ? [tradeId, limit] : [limit];
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];

    return rows.map((r) => ({
      id: r.id as number,
      tradeId: (r.trade_id as string) || null,
      eventType: r.event_type as string,
      payload: r.payload ? JSON.parse(r.payload as string) : null,
      createdAt: r.created_at as string,
    }));
  }

  /** Discord msg IDs already unlocked or journaled — button may still show in UI. */
  listUnlockedDiscordMsgIds(): string[] {
    const fromTrades = this.db
      .prepare(`SELECT discord_signal_msg_id AS id FROM open_trades WHERE discord_signal_msg_id != ''`)
      .all() as { id: string }[];
    const fromEvents = this.db
      .prepare(
        `SELECT json_extract(payload, '$.discordMsgId') AS id
         FROM trade_events
         WHERE event_type = 'unlock_done' AND json_extract(payload, '$.discordMsgId') IS NOT NULL`,
      )
      .all() as { id: string }[];
    return [...new Set([...fromTrades, ...fromEvents].map((r) => r.id).filter(Boolean))];
  }

  markUnlockDone(discordMsgId: string, meta?: { trader?: string; asset?: string }): void {
    this.logEvent(null, "unlock_done", {
      ...msgTiming(discordMsgId),
      trader: meta?.trader ?? "unknown",
      asset: meta?.asset,
    });
  }

  summary(): { open: number; pending: number; active: number; closed: number; events: number } {
    const counts = this.db
      .prepare(
        `SELECT status, COUNT(*) AS c FROM open_trades GROUP BY status`,
      )
      .all() as { status: string; c: number }[];
    const byStatus = Object.fromEntries(counts.map((r) => [r.status, r.c]));
    const events = this.db.prepare(`SELECT COUNT(*) AS c FROM trade_events`).get() as { c: number };
    return {
      open:
        (byStatus.pending_limit ?? 0) +
        (byStatus.partial_fill ?? 0) +
        (byStatus.active ?? 0),
      pending: byStatus.pending_limit ?? 0,
      active: (byStatus.partial_fill ?? 0) + (byStatus.active ?? 0),
      closed: byStatus.closed ?? 0,
      events: events.c,
    };
  }
}
