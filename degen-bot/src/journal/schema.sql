-- Every CA-only trigger we acted on. discord_msg_id is unique so a replayed or
-- duplicated gateway event cannot cause a second buy.
CREATE TABLE IF NOT EXISTS buys (
  discord_msg_id TEXT PRIMARY KEY,
  mint TEXT NOT NULL,
  author_id TEXT NOT NULL,
  status TEXT NOT NULL,
  sol_spent REAL NOT NULL DEFAULT 0,
  out_amount TEXT,
  tx_signature TEXT,
  latency_ms INTEGER,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tokens swept to DEGEN_DEST_WALLET after a buy (or manual sweep).
CREATE TABLE IF NOT EXISTS sweeps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_msg_id TEXT,
  mint TEXT NOT NULL,
  amount TEXT NOT NULL,
  dest_wallet TEXT NOT NULL,
  sol_spent REAL,
  buy_tx_signature TEXT,
  sweep_tx_signature TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sweeps_mint ON sweeps(mint);
CREATE INDEX IF NOT EXISTS idx_sweeps_created ON sweeps(created_at DESC);
