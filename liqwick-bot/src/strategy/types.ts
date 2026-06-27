import type { Regime } from "../regime/detector.js";
import type { ConfluenceBreakdown } from "./confluence.js";
import type { SweepPhase } from "./state-machine.js";

export interface WickSignal {
  side: "long" | "short";
  symbol: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  sweepLevel: number;
  atr: number;
  score: ConfluenceBreakdown;
  reason: string;
  sweepId?: string;
}

export interface SymbolMonitorSnapshot {
  symbol: string;
  phase: SweepPhase;
  side: "long" | "short" | null;
  score: number | null;
  scoreBreakdown: ConfluenceBreakdown | null;
  fundingRate: number | null;
  basisBps: number | null;
  extremum: number | null;
  sweptLevel: number | null;
  liqBurstLong: number | null;
  liqBurstShort: number | null;
  updatedAt: string;
}

export interface StreamHealth {
  wsConnected: boolean;
  wsLastMessageAt: number | null;
  dataSource: "ws" | "rest";
  wsLastMessageAgeMs: number | null;
}

export interface BotStatus {
  regime: Regime;
  regimeUpdatedAt: string | null;
  dryRun: boolean;
  symbols: string[];
  lastScanAt: string | null;
  signalsToday: number;
  openPositions: number;
  monitors: SymbolMonitorSnapshot[];
  circuitBreaker: {
    dailyLossUsdt: number;
    tradesToday: number;
  };
  streamHealth?: StreamHealth;
  optimization?: {
    totalSweeps: number;
    triggered: number;
    nearMiss: number;
    aborts: number;
    avgPeakScore: number;
    byOutcome: Record<string, number>;
  };
  testnet?: boolean;
  enterThreshold?: number;
}
