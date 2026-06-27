import type { MarkPriceUpdate } from "../binance/websocket.js";
import { config } from "../config.js";

/** Tracks live funding rate + mark-index basis from @markPrice@1s. */
export class FundingTracker {
  fundingRate = 0;
  basisBps = 0;
  nextFundingTime = 0;
  updatedAt = 0;

  update(update: MarkPriceUpdate): void {
    this.fundingRate = update.fundingRate;
    this.basisBps =
      update.indexPrice > 0
        ? ((update.markPrice - update.indexPrice) / update.indexPrice) * 10_000
        : 0;
    this.nextFundingTime = update.nextFundingTime;
    this.updatedAt = update.timestamp;
  }

  /** 0–5 from funding alignment with expected flush direction. */
  fundingAlignment(side: "long" | "short"): number {
    const extreme = config.fundingExtreme;
    if (extreme <= 0) return 0;

    if (side === "long") {
      if (this.fundingRate <= 0) return 0;
      return Math.min(5, (this.fundingRate / extreme) * 5);
    }

    if (this.fundingRate >= 0) return 0;
    return Math.min(5, (Math.abs(this.fundingRate) / extreme) * 5);
  }

  /** 0–5 from basis (mark-index premium) alignment. */
  basisAlignment(side: "long" | "short"): number {
    const extreme = config.basisExtremeBps;
    if (extreme <= 0) return 0;

    if (side === "long") {
      if (this.basisBps <= 0) return 0;
      return Math.min(5, (this.basisBps / extreme) * 5);
    }

    if (this.basisBps >= 0) return 0;
    return Math.min(5, (Math.abs(this.basisBps) / extreme) * 5);
  }

  /** Combined positioning score (max 10). */
  positioningScore(side: "long" | "short"): number {
    return Math.min(10, this.fundingAlignment(side) + this.basisAlignment(side));
  }

  /** Penalty when positioning contradicts the trade side (max POSITIONING_BIAS_MAX). */
  contradictionPenalty(side: "long" | "short"): number {
    const max = config.positioningBiasMax;
    const fundingExtreme = config.fundingExtreme;
    const basisExtreme = config.basisExtremeBps;
    const half = max / 2;

    if (side === "long") {
      let penalty = 0;
      if (this.fundingRate < -fundingExtreme && fundingExtreme > 0) {
        penalty += Math.min(half, (Math.abs(this.fundingRate) / fundingExtreme) * half);
      }
      if (this.basisBps < -basisExtreme && basisExtreme > 0) {
        penalty += Math.min(half, (Math.abs(this.basisBps) / basisExtreme) * half);
      }
      return Math.min(max, penalty);
    }

    let penalty = 0;
    if (this.fundingRate > fundingExtreme && fundingExtreme > 0) {
      penalty += Math.min(half, (this.fundingRate / fundingExtreme) * half);
    }
    if (this.basisBps > basisExtreme && basisExtreme > 0) {
      penalty += Math.min(half, (this.basisBps / basisExtreme) * half);
    }
    return Math.min(max, penalty);
  }
}
