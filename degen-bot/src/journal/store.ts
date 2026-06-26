import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BuyResult } from "../solana/buy-all.js";
import type { SweepResult } from "../solana/sweep-token.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface SweepRow {
  id: number;
  discordMsgId: string | null;
  mint: string;
  amount: string;
  destWallet: string;
  solSpent: number | null;
  buyTxSignature: string | null;
  sweepTxSignature: string | null;
  status: string;
  createdAt: string;
}

export interface BuyRow {
  discordMsgId: string;
  mint: string;
  authorId: string;
  status: string;
  solSpent: number;
  outAmount: string | null;
  txSignature: string | null;
  latencyMs: number | null;
  reason: string | null;
  createdAt: string;
}

export class DegenStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(readFileSync(join(__dirname, "schema.sql"), "utf8"));
  }

  close(): void {
    this.db.close();
  }

  /** True if this message was already acted on (any outcome). */
  hasSeen(discordMsgId: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 FROM buys WHERE discord_msg_id = ?`)
      .get(discordMsgId);
    return row !== undefined;
  }

  /**
   * Atomically claims a message id so concurrent/duplicate gateway events cannot
   * both trigger a buy. Returns false if it was already claimed.
   */
  claim(discordMsgId: string, mint: string, authorId: string): boolean {
    const res = this.db
      .prepare(
        `INSERT OR IGNORE INTO buys (discord_msg_id, mint, author_id, status)
         VALUES (?, ?, ?, 'pending')`,
      )
      .run(discordMsgId, mint, authorId);
    return res.changes > 0;
  }

  recordResult(discordMsgId: string, result: BuyResult): void {
    this.db
      .prepare(
        `UPDATE buys
         SET status = ?, sol_spent = ?, out_amount = ?, tx_signature = ?, latency_ms = ?, reason = ?
         WHERE discord_msg_id = ?`,
      )
      .run(
        result.status,
        result.solSpent,
        result.outAmount ?? null,
        result.txSignature ?? null,
        result.latencyMs,
        result.reason ?? null,
        discordMsgId,
      );
    if (result.sweep) {
      this.recordSweep(discordMsgId, result.solSpent, result.txSignature ?? null, result.sweep);
    }
  }

  recordSweep(
    discordMsgId: string | null,
    solSpent: number | null,
    buyTxSignature: string | null,
    sweep: SweepResult,
  ): void {
    this.db
      .prepare(
        `INSERT INTO sweeps (discord_msg_id, mint, amount, dest_wallet, sol_spent, buy_tx_signature, sweep_tx_signature, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        discordMsgId,
        sweep.mint,
        sweep.amount,
        sweep.destWallet,
        solSpent,
        buyTxSignature,
        sweep.txSignature ?? null,
        sweep.status,
      );
  }

  recordError(discordMsgId: string, message: string): void {
    this.db
      .prepare(`UPDATE buys SET status = 'error', reason = ? WHERE discord_msg_id = ?`)
      .run(message, discordMsgId);
  }

  logEvent(eventType: string, payload?: unknown): void {
    this.db
      .prepare(`INSERT INTO events (event_type, payload) VALUES (?, ?)`)
      .run(eventType, payload ? JSON.stringify(payload) : null);
  }

  listBuys(limit = 50): BuyRow[] {
    const rows = this.db
      .prepare(
        `SELECT discord_msg_id, mint, author_id, status, sol_spent, out_amount,
                tx_signature, latency_ms, reason, created_at
         FROM buys ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as Record<string, unknown>[];
    return rows.map((r) => ({
      discordMsgId: r.discord_msg_id as string,
      mint: r.mint as string,
      authorId: r.author_id as string,
      status: r.status as string,
      solSpent: r.sol_spent as number,
      outAmount: (r.out_amount as string) ?? null,
      txSignature: (r.tx_signature as string) ?? null,
      latencyMs: (r.latency_ms as number) ?? null,
      reason: (r.reason as string) ?? null,
      createdAt: r.created_at as string,
    }));
  }

  listSweeps(limit = 100): SweepRow[] {
    const rows = this.db
      .prepare(
        `SELECT id, discord_msg_id, mint, amount, dest_wallet, sol_spent,
                buy_tx_signature, sweep_tx_signature, status, created_at
         FROM sweeps ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as number,
      discordMsgId: (r.discord_msg_id as string) ?? null,
      mint: r.mint as string,
      amount: r.amount as string,
      destWallet: r.dest_wallet as string,
      solSpent: (r.sol_spent as number) ?? null,
      buyTxSignature: (r.buy_tx_signature as string) ?? null,
      sweepTxSignature: (r.sweep_tx_signature as string) ?? null,
      status: r.status as string,
      createdAt: r.created_at as string,
    }));
  }
}
