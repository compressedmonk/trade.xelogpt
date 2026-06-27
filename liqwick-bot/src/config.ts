import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv();

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function parseList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function parseNumber(name: string, fallback: number, min = 0): number {
  const raw = Number(optional(name, String(fallback)));
  return Number.isFinite(raw) && raw >= min ? raw : fallback;
}

export type EntryMode = "reversal_tick" | "knife";

export const config = {
  dryRun: optional("DRY_RUN", "true").toLowerCase() !== "false",
  dbPath: resolve(optional("DB_PATH", "./data/liqwick.db")),
  dashboardPort: parseNumber("DASHBOARD_PORT", 3850, 1),
  dashboardHost: optional("DASHBOARD_HOST", "127.0.0.1"),

  binanceApiKey: optional("BINANCE_API_KEY", ""),
  binanceApiSecret: optional("BINANCE_API_SECRET", ""),
  binanceTestnet: optional("BINANCE_TESTNET", "true").toLowerCase() !== "false",

  symbolWhitelist: parseList(optional("SYMBOL_WHITELIST", "BTCUSDT,ETHUSDT,SOLUSDT")),

  regimeSymbol: optional("REGIME_SYMBOL", "BTCUSDT").toUpperCase(),
  regimeTimeframe: optional("REGIME_TIMEFRAME", "4h"),
  regimePollMs: parseNumber("REGIME_POLL_MS", 900_000, 60_000),
  regimeEmaPeriod: parseNumber("REGIME_EMA_PERIOD", 200, 2),
  regimeEmaSlopeBars: parseNumber("REGIME_EMA_SLOPE_BARS", 5, 1),

  entryMode: (optional("ENTRY_MODE", "reversal_tick") as EntryMode),
  enterThreshold: parseNumber("ENTER_THRESHOLD", 60, 1),
  atrPeriod: parseNumber("ATR_PERIOD", 14, 2),
  sweepAtrK: parseNumber("SWEEP_ATR_K", 0.25, 0),
  reversalAtrK: parseNumber("REVERSAL_ATR_K", 0.3, 0),
  slAtrK: parseNumber("SL_ATR_K", 0.5, 0),
  slMinAtr: parseNumber("SL_MIN_ATR", 0.3, 0),
  slMaxAtr: parseNumber("SL_MAX_ATR", 3, 0),
  tp1R: parseNumber("TP1_R", 1, 0.1),
  tp2R: parseNumber("TP2_R", 2, 0.1),
  tp1ClosePct: parseNumber("TP1_CLOSE_PCT", 50, 1),

  liqWindowMs: parseNumber("LIQ_WINDOW_MS", 10_000, 1000),
  liqBurstMult: parseNumber("LIQ_BURST_MULT", 3, 0.1),
  volSpikeMult: parseNumber("VOL_SPIKE_MULT", 2, 0.1),
  sweepTimeoutMs: parseNumber("SWEEP_TIMEOUT_MS", 8000, 1000),
  velocityWindowMs: parseNumber("WICK_VELOCITY_MS", 10_000, 1000),

  levelsRefreshMs: parseNumber("LEVELS_REFRESH_MS", 300_000, 60_000),
  fractalLookback: parseNumber("FRACTAL_LOOKBACK", 5, 2),

  defaultRiskPct: parseNumber("DEFAULT_RISK_PCT", 1, 0.01),
  defaultBalanceUsdt: parseNumber("DEFAULT_BALANCE_USDT", 1000, 0),
  maxNotionalUsdt: parseNumber("MAX_NOTIONAL_USDT", 0, 0),
  tradeCooldownMs: parseNumber("TRADE_COOLDOWN_MS", 1_800_000, 0),
  abortCooldownMs: parseNumber("ABORT_COOLDOWN_MS", 600_000, 0),

  dailyMaxLossUsdt: parseNumber("DAILY_MAX_LOSS_USDT", 0, 0),
  maxConcurrentPositions: parseNumber("MAX_CONCURRENT_POSITIONS", 2, 1),
  maxTradesPerDay: parseNumber("MAX_TRADES_PER_DAY", 0, 0),

  fundingExtreme: parseNumber("FUNDING_EXTREME", 0.0003, 0),
  basisExtremeBps: parseNumber("BASIS_EXTREME_BPS", 4, 0),
  positioningBiasMax: parseNumber("POSITIONING_BIAS_MAX", 5, 0),

  journalEnabled: optional("JOURNAL_ENABLED", "true").toLowerCase() !== "false",
  nearMissMinScore: parseNumber("NEAR_MISS_MIN_SCORE", 45, 0),
};

export function strategyConfig() {
  return {
    entryMode: config.entryMode,
    enterThreshold: config.enterThreshold,
    atrPeriod: config.atrPeriod,
    sweepAtrK: config.sweepAtrK,
    reversalAtrK: config.reversalAtrK,
    slAtrK: config.slAtrK,
    slMinAtr: config.slMinAtr,
    slMaxAtr: config.slMaxAtr,
    tp1R: config.tp1R,
    tp2R: config.tp2R,
    tp1ClosePct: config.tp1ClosePct,
    liqBurstMult: config.liqBurstMult,
    volSpikeMult: config.volSpikeMult,
    sweepTimeoutMs: config.sweepTimeoutMs,
  };
}
