export interface OneEuroOptions {
  /** Cutoff (Hz) when still; lower is smoother. */
  readonly minCutoff: number;
  /** How quickly the cutoff rises with speed; higher is more responsive. */
  readonly beta: number;
  /** Cutoff (Hz) for the speed estimate. */
  readonly dCutoff: number;
}

/** Gaze in screen pixels: steady during fixations, quick to follow saccades. */
export const GAZE_FILTER: OneEuroOptions = { minCutoff: 0.6, beta: 0.008, dCutoff: 1 };

const alpha = (cutoff: number, dt: number): number => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

/** One Euro filter (Casiez, Roussel and Vogel, 2012). */
export class OneEuroFilter {
  private readonly options: OneEuroOptions;
  private value: number | null = null;
  private speed = 0;
  private lastT = 0;

  constructor(options: OneEuroOptions) {
    this.options = options;
  }

  /** Filters `x` observed at time `tSeconds`. */
  filter(x: number, tSeconds: number): number {
    if (this.value === null) {
      this.value = x;
      this.lastT = tSeconds;
      return x;
    }
    const dt = tSeconds - this.lastT;
    if (dt <= 0) return this.value;
    this.lastT = tSeconds;
    const rawSpeed = (x - this.value) / dt;
    this.speed += alpha(this.options.dCutoff, dt) * (rawSpeed - this.speed);
    const cutoff = this.options.minCutoff + this.options.beta * Math.abs(this.speed);
    this.value += alpha(cutoff, dt) * (x - this.value);
    return this.value;
  }

  reset(): void {
    this.value = null;
    this.speed = 0;
  }
}
