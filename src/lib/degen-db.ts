import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface DegenSweepRow {
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

export interface DegenBuyRow {
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

function dbPath(): string {
  return resolve(process.env.DEGEN_DB_PATH ?? "./degen-bot/data/degen.db");
}

function openDb(): Database.Database | null {
  const path = dbPath();
  if (!existsSync(path)) return null;
  const db = new Database(path, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  return db;
}

export function listDegenSweeps(limit = 100): DegenSweepRow[] {
  const db = openDb();
  if (!db) return [];
  try {
    const hasSweeps = db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='sweeps'`)
      .get();
    if (!hasSweeps) return [];
    const rows = db
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
  } finally {
    db.close();
  }
}

export function listDegenBuys(limit = 50): DegenBuyRow[] {
  const db = openDb();
  if (!db) return [];
  try {
    const rows = db
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
  } finally {
    db.close();
  }
}

export function degenDbConfigured(): boolean {
  return existsSync(dbPath());
}
