import type { KlineBar } from "../binance/client.js";
import type { ForceOrderUpdate, MarkPriceUpdate } from "../binance/websocket.js";
import { config } from "../config.js";
import type { BotStore } from "../db/store.js";
import { executeWickSignal } from "../executor/open-position.js";
import { CircuitBreaker } from "../risk/circuit-breaker.js";
import type { Regime } from "../regime/detector.js";
import { computeAtr } from "./indicators.js";
import { fetchLevelsForSymbol, type SignificantLevel } from "./levels.js";
import { LiquidationTracker } from "./liquidation-tracker.js";
import { FundingTracker } from "./funding-tracker.js";
import {
  evaluateSweep,
  initialSweepState,
  type StateEvent,
  type SymbolSweepState,
  type WickSignal,
} from "./state-machine.js";
import type { SweepJournalEntry } from "./sweep-journal.js";
import type { SymbolMonitorSnapshot } from "./types.js";
import { VelocityTracker } from "./velocity.js";
import { log } from "../util/logger.js";
import type { BinanceFuturesClient } from "../binance/client.js";

interface SymbolState {
  closedBars: KlineBar[];
  formingBar: KlineBar | null;
  levels: SignificantLevel[];
  sweep: SymbolSweepState;
  velocity: VelocityTracker;
  liqTracker: LiquidationTracker;
  fundingTracker: FundingTracker;
  atr: number;
}

export class WickMonitor {
  private readonly states = new Map<string, SymbolState>();
  private regime: Regime = "neutral";
  private executing = false;
  private readonly circuit: CircuitBreaker;

  constructor(
    private readonly symbols: string[],
    private readonly store: BotStore,
    private readonly client: BinanceFuturesClient,
    private readonly onSignal?: (signal: WickSignal) => void,
  ) {
    this.circuit = new CircuitBreaker(store);
  }

  setRegime(regime: Regime): void {
    if (this.regime !== regime) {
      const prev = this.regime;
      log("regime", `${prev} → ${regime}`);
      this.regime = regime;
      this.store.setRegime(regime);
      this.store.logEvent(null, "regime_change", { from: prev, to: regime, at: new Date().toISOString() });
    }
  }

  async seedHistory(symbol: string, bars: KlineBar[]): Promise<void> {
    const closed = bars.filter((b) => b.closed);
    const levels = await fetchLevelsForSymbol(this.client, symbol, config.fractalLookback);
    this.states.set(symbol, this.makeState(closed, levels));
  }

  async refreshLevels(symbol: string): Promise<void> {
    const state = this.states.get(symbol);
    if (!state) return;
    state.levels = await fetchLevelsForSymbol(this.client, symbol, config.fractalLookback);
  }

  handleKline(symbol: string, bar: KlineBar): void {
    const state = this.ensureState(symbol);
    if (bar.closed) {
      state.closedBars = mergeClosedBar(state.closedBars, bar);
      state.atr = computeAtr(state.closedBars, config.atrPeriod);
      if (state.formingBar?.openTime === bar.openTime) {
        state.formingBar = null;
      }
      return;
    }
    state.formingBar = bar;
    this.tick(symbol, state, bar);
  }

  handleAggTrade(symbol: string, price: number, timestamp: number): void {
    const state = this.ensureState(symbol);
    state.velocity.add(price, timestamp);
    const bar = this.ensureFormingBar(state, price);
    this.tick(symbol, state, bar);
  }

  handleForceOrder(order: ForceOrderUpdate): void {
    const state = this.states.get(order.symbol);
    if (!state) return;
    state.liqTracker.add(order);
  }

  handleMarkPrice(update: MarkPriceUpdate): void {
    const state = this.ensureState(update.symbol);
    state.fundingTracker.update(update);
  }

  getSnapshots(): SymbolMonitorSnapshot[] {
    const now = new Date().toISOString();
    return this.symbols.map((symbol) => {
      const s = this.states.get(symbol);
      if (!s) {
        return {
          symbol,
          phase: "idle",
          side: null,
          score: null,
          scoreBreakdown: null,
          fundingRate: null,
          basisBps: null,
          extremum: null,
          sweptLevel: null,
          liqBurstLong: null,
          liqBurstShort: null,
          updatedAt: now,
        };
      }
      return {
        symbol,
        phase: s.sweep.phase,
        side: s.sweep.side,
        score: s.sweep.lastScore?.total ?? null,
        scoreBreakdown: s.sweep.lastScore,
        fundingRate: s.fundingTracker.updatedAt > 0 ? s.fundingTracker.fundingRate : null,
        basisBps: s.fundingTracker.updatedAt > 0 ? s.fundingTracker.basisBps : null,
        extremum: s.sweep.extremum || null,
        sweptLevel: s.sweep.sweptLevel?.price ?? null,
        liqBurstLong: Number(s.liqTracker.burstRatio("long").toFixed(2)),
        liqBurstShort: Number(s.liqTracker.burstRatio("short").toFixed(2)),
        updatedAt: now,
      };
    });
  }

  getCircuitStats() {
    return this.circuit.getStats();
  }

  private makeState(closedBars: KlineBar[], levels: SignificantLevel[]): SymbolState {
    return {
      closedBars: closedBars.slice(-500),
      formingBar: null,
      levels,
      sweep: initialSweepState(),
      velocity: new VelocityTracker(config.velocityWindowMs),
      liqTracker: new LiquidationTracker(config.liqWindowMs),
      fundingTracker: new FundingTracker(),
      atr: computeAtr(closedBars, config.atrPeriod),
    };
  }

  private ensureFormingBar(state: SymbolState, price: number): KlineBar {
    if (state.formingBar && !state.formingBar.closed) {
      state.formingBar = {
        ...state.formingBar,
        close: price,
        high: Math.max(state.formingBar.high, price),
        low: Math.min(state.formingBar.low, price),
      };
      return state.formingBar;
    }

    const last = state.closedBars[state.closedBars.length - 1];
    const openTime = last ? last.closeTime + 1 : Math.floor(Date.now() / 60_000) * 60_000;
    state.formingBar = {
      openTime,
      closeTime: openTime + 60_000 - 1,
      open: last?.close ?? price,
      high: Math.max(last?.high ?? price, price),
      low: Math.min(last?.low ?? price, price),
      close: price,
      volume: 0,
      quoteVolume: 0,
      tradeCount: 0,
      takerBuyQuoteVolume: 0,
      closed: false,
    };
    return state.formingBar;
  }

  private ensureState(symbol: string): SymbolState {
    let state = this.states.get(symbol);
    if (!state) {
      state = this.makeState([], []);
      this.states.set(symbol, state);
    }
    return state;
  }

  private tick(symbol: string, state: SymbolState, bar: KlineBar): void {
    this.store.setState("last_scan_at", new Date().toISOString());
    if (state.atr <= 0) state.atr = computeAtr(state.closedBars, config.atrPeriod);
    if (state.atr <= 0) return;

    const { state: next, events } = evaluateSweep({
      symbol,
      regime: this.regime,
      bar,
      atr: state.atr,
      levels: state.levels,
      closedBars: state.closedBars,
      liqTracker: state.liqTracker,
      fundingTracker: state.fundingTracker,
      velocity: state.velocity,
      state: state.sweep,
      now: Date.now(),
      entryMode: config.entryMode,
    });
    state.sweep = next;
    for (const event of events) this.handleEvent(event);
  }

  private handleEvent(event: StateEvent): void {
    if (event.type === "phase") return;

    if (event.type === "sweep_closed") {
      this.persistJournal(event.journal);
      if (event.journal.outcome.startsWith("aborted")) {
        this.circuit.recordAbort(event.journal.symbol);
      }
      return;
    }

    this.onSignal?.(event.signal);
    void this.execute(event.signal, event.journal);
  }

  private persistJournal(journal: SweepJournalEntry): void {
    log(
      "journal",
      `${journal.symbol} ${journal.outcome} peak=${journal.peakScore} final=${journal.finalScore} ${journal.blockReason ?? ""}`,
    );
    if (config.journalEnabled) this.store.logSweepJournal(journal);
    if (journal.outcome.startsWith("aborted")) {
      const reason = journal.outcome.replace("aborted_", "");
      this.store.logEvent(null, "sweep_abort", { type: "abort", reason, symbol: journal.symbol });
    }
  }

  private async execute(signal: WickSignal, journal: SweepJournalEntry): Promise<void> {
    if (this.executing) {
      this.persistJournal({ ...journal, outcome: "skipped_exec", blockReason: "executor_busy" });
      return;
    }

    const gate = this.circuit.canTrade(signal.symbol);
    if (!gate.ok) {
      log("signal", `skipped ${signal.symbol}: ${gate.reason}`);
      this.persistJournal({ ...journal, outcome: "skipped_circuit", blockReason: gate.reason });
      return;
    }

    this.executing = true;
    try {
      const result = await executeWickSignal(signal, this.regime, this.store);
      if (result.ok) {
        this.persistJournal({ ...journal, signalId: result.tradeId });
        this.circuit.recordTrade();
      } else {
        log("signal", `skipped ${signal.symbol}: ${result.error}`);
        this.persistJournal({ ...journal, outcome: "skipped_exec", blockReason: result.error });
      }
    } finally {
      this.executing = false;
    }
  }
}

function mergeClosedBar(history: KlineBar[], bar: KlineBar): KlineBar[] {
  const next = [...history];
  const idx = next.findIndex((b) => b.openTime === bar.openTime);
  if (idx >= 0) next[idx] = bar;
  else next.push(bar);
  return next.filter((b) => b.closed).slice(-500);
}
