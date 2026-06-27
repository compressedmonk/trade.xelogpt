export type PriceDirection = "up" | "down" | "flat";

export class VelocityTracker {
  private samples: Array<{ t: number; price: number }> = [];
  private prevDirection: PriceDirection = "flat";

  constructor(private readonly windowMs: number) {}

  add(price: number, timestamp = Date.now()): void {
    this.samples.push({ t: timestamp, price });
    const cutoff = timestamp - this.windowMs;
    while (this.samples.length > 0 && this.samples[0].t < cutoff) {
      this.samples.shift();
    }
  }

  peakPrice(): number {
    if (this.samples.length === 0) return 0;
    return Math.max(...this.samples.map((s) => s.price));
  }

  troughPrice(): number {
    if (this.samples.length === 0) return 0;
    return Math.min(...this.samples.map((s) => s.price));
  }

  /** Normalized drop from peak to trough (0–1). */
  dropFromPeak(): number {
    const peak = this.peakPrice();
    const trough = this.troughPrice();
    if (peak <= 0) return 0;
    return (peak - trough) / peak;
  }

  /** Normalized rise from trough to peak (0–1). */
  riseFromTrough(): number {
    const peak = this.peakPrice();
    const trough = this.troughPrice();
    if (trough <= 0) return 0;
    return (peak - trough) / trough;
  }

  direction(): PriceDirection {
    if (this.samples.length < 3) return "flat";
    const head = this.samples.slice(0, Math.max(1, Math.floor(this.samples.length / 2)));
    const tail = this.samples.slice(Math.floor(this.samples.length / 2));
    const headAvg = head.reduce((s, x) => s + x.price, 0) / head.length;
    const tailAvg = tail.reduce((s, x) => s + x.price, 0) / tail.length;
    const delta = tailAvg - headAvg;
    const threshold = headAvg * 0.0001;
    if (delta > threshold) return "up";
    if (delta < -threshold) return "down";
    return "flat";
  }

  /** True when direction flipped (e.g. down → up for long reversal). */
  directionReversed(expected: "long" | "short"): boolean {
    const cur = this.direction();
    const reversed =
      (expected === "long" && this.prevDirection === "down" && cur === "up") ||
      (expected === "short" && this.prevDirection === "up" && cur === "down");
    this.prevDirection = cur;
    return reversed;
  }

  /** Simple acceleration: recent move vs prior move in same window. */
  acceleration(): number {
    if (this.samples.length < 4) return 0;
    const mid = Math.floor(this.samples.length / 2);
    const first = this.samples[mid].price - this.samples[0].price;
    const second = this.samples[this.samples.length - 1].price - this.samples[mid].price;
    return second - first;
  }

  normalizedMoveAtr(atr: number, side: "long" | "short"): number {
    if (atr <= 0) return 0;
    const move = side === "long" ? this.dropFromPeak() * this.peakPrice() : this.riseFromTrough() * this.troughPrice();
    return move / atr;
  }
}
