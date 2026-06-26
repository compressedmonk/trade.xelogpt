CREATE TABLE IF NOT EXISTS open_trades (
  id TEXT PRIMARY KEY,
  trader TEXT NOT NULL,
  asset TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  signal_entry_min REAL NOT NULL,
  signal_entry_max REAL NOT NULL,
  signal_stop_loss REAL NOT NULL,
  signal_risk_pct REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_limit',
  sl_order_id TEXT,
  avg_fill_price REAL,
  discord_signal_msg_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trade_legs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id TEXT NOT NULL REFERENCES open_trades(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  limit_price REAL NOT NULL,
  quantity REAL NOT NULL,
  weight_pct REAL NOT NULL,
  order_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  fill_price REAL,
  UNIQUE(trade_id, step)
);

CREATE TABLE IF NOT EXISTS trade_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id TEXT,
  event_type TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_open_trades_trader_asset ON open_trades(trader, asset);
CREATE INDEX IF NOT EXISTS idx_open_trades_status ON open_trades(status);
CREATE INDEX IF NOT EXISTS idx_trade_legs_trade_id ON trade_legs(trade_id);
