import { config } from "../config.js";
import type { BotStore } from "../db/store.js";

export class CircuitBreaker {
  private dailyLossUsdt = 0;
  private tradesToday = 0;
  private dayKey = todayKey();

  constructor(private readonly store: BotStore) {}

  canTrade(symbol: string): { ok: boolean; reason?: string } {
    this.rollDay();
    if (this.store.hasOpenPosition(symbol)) {
      return { ok: false, reason: "open position exists" };
    }
    if (this.store.isOnCooldown(symbol)) {
      return { ok: false, reason: "cooldown active" };
    }
    const openCount = this.store.countOpenPositions();
    if (openCount >= config.maxConcurrentPositions) {
      return { ok: false, reason: "max concurrent positions" };
    }
    if (config.dailyMaxLossUsdt > 0 && this.dailyLossUsdt >= config.dailyMaxLossUsdt) {
      return { ok: false, reason: "daily loss limit" };
    }
    if (config.maxTradesPerDay > 0 && this.tradesToday >= config.maxTradesPerDay) {
      return { ok: false, reason: "max trades per day" };
    }
    return { ok: true };
  }

  recordTrade(): void {
    this.rollDay();
    this.tradesToday++;
  }

  recordAbort(symbol: string): void {
    this.store.setAbortCooldown(symbol);
  }

  recordLoss(amountUsdt: number): void {
    this.rollDay();
    if (amountUsdt > 0) this.dailyLossUsdt += amountUsdt;
  }

  getStats() {
    this.rollDay();
    return {
      dailyLossUsdt: this.dailyLossUsdt,
      tradesToday: this.tradesToday,
      dayKey: this.dayKey,
    };
  }

  private rollDay(): void {
    const key = todayKey();
    if (key !== this.dayKey) {
      this.dayKey = key;
      this.dailyLossUsdt = 0;
      this.tradesToday = 0;
    }
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
