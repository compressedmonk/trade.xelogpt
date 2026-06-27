CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  entry_price REAL NOT NULL,
  stop_loss REAL NOT NULL,
  take_profit REAL NOT NULL,
  take_profit1 REAL,
  quantity REAL NOT NULL,
  regime TEXT NOT NULL,
  signal_reason TEXT NOT NULL,
  confluence_score INTEGER,
  dry_run INTEGER NOT NULL DEFAULT 1,
  entry_order_id TEXT,
  sl_order_id TEXT,
  tp_order_id TEXT,
  tp1_order_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS signal_events (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  entry_price REAL NOT NULL,
  stop_loss REAL NOT NULL,
  take_profit REAL NOT NULL,
  take_profit1 REAL,
  quantity REAL NOT NULL,
  regime TEXT NOT NULL,
  reason TEXT NOT NULL,
  confluence_score INTEGER,
  score_breakdown TEXT,
  dry_run INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bot_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id TEXT,
  event_type TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bot_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS symbol_cooldowns (
  symbol TEXT PRIMARY KEY,
  until_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_positions_symbol_status ON positions(symbol, status);
CREATE INDEX IF NOT EXISTS idx_signal_events_created ON signal_events(created_at);

CREATE TABLE IF NOT EXISTS sweep_journal (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  regime TEXT NOT NULL,
  outcome TEXT NOT NULL,
  block_reason TEXT,
  swept_level REAL NOT NULL,
  level_type TEXT,
  extremum REAL NOT NULL,
  depth_atr REAL,
  max_depth_atr REAL,
  atr REAL,
  duration_ms INTEGER,
  peak_score INTEGER,
  final_score INTEGER,
  enter_threshold INTEGER,
  score_breakdown TEXT,
  funding_rate REAL,
  basis_bps REAL,
  liq_burst_ratio REAL,
  reversal_seen INTEGER NOT NULL DEFAULT 0,
  score_reached_threshold INTEGER NOT NULL DEFAULT 0,
  entry_price REAL,
  stop_loss REAL,
  take_profit1 REAL,
  take_profit2 REAL,
  signal_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sweep_journal_created ON sweep_journal(created_at);
CREATE INDEX IF NOT EXISTS idx_sweep_journal_outcome ON sweep_journal(outcome);
CREATE INDEX IF NOT EXISTS idx_sweep_journal_symbol ON sweep_journal(symbol);
