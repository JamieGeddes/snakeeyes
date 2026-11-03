/** Counts events in a sliding time window to report a rate per second. */
export class RateMeter {
  private readonly times: number[] = [];
  private readonly windowMs: number;

  constructor(windowMs = 1000) {
    this.windowMs = windowMs;
  }

  tick(nowMs: number): void {
    this.times.push(nowMs);
    this.prune(nowMs);
  }

  rate(nowMs: number): number {
    this.prune(nowMs);
    return (this.times.length * 1000) / this.windowMs;
  }

  private prune(nowMs: number): void {
    while (this.times.length > 0 && (this.times[0] ?? 0) <= nowMs - this.windowMs) {
      this.times.shift();
    }
  }
}

/** Mean, standard deviation and range of samples within a sliding time window. */
export class WindowStats {
  private readonly samples: { t: number; v: number }[] = [];
  private readonly windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  add(nowMs: number, value: number): void {
    this.samples.push({ t: nowMs, v: value });
    while (this.samples.length > 0 && (this.samples[0]?.t ?? 0) <= nowMs - this.windowMs) {
      this.samples.shift();
    }
  }

  get count(): number {
    return this.samples.length;
  }

  get mean(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((s, x) => s + x.v, 0) / this.samples.length;
  }

  get std(): number {
    if (this.samples.length < 2) return 0;
    const m = this.mean;
    const sq = this.samples.reduce((s, x) => s + (x.v - m) ** 2, 0);
    return Math.sqrt(sq / (this.samples.length - 1));
  }

  get range(): number {
    if (this.samples.length === 0) return 0;
    const vs = this.samples.map((x) => x.v);
    return Math.max(...vs) - Math.min(...vs);
  }

  /** Value below which `p` (0 to 1) of samples fall. */
  percentile(p: number): number {
    if (this.samples.length === 0) return 0;
    const sorted = this.samples.map((x) => x.v).sort((a, b) => a - b);
    const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[i] ?? 0;
  }
}
