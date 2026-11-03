import { distance, vec, type Vec2 } from '../game/vec';
import { featureVector, FEATURE_FLOORS, type GazeInputs, type GazeSample } from './features';
import { columnMedians, median } from './linalg';
import { GAZE_FILTER, OneEuroFilter, type OneEuroOptions } from './oneEuro';
import { fitRidgeCv, predictRidge, type RidgeModel } from './regression';

/** 3×3 grid, as fractions of the screen. */
export const CALIBRATION_POINTS: readonly Vec2[] = [0.1, 0.5, 0.9].flatMap((y, row) =>
  // Snake order so each move is short.
  (row % 2 ? [0.9, 0.5, 0.1] : [0.1, 0.5, 0.9]).map((x) => vec(x, y)),
);

/** Between the calibration points, so validation tests interpolation. */
export const VALIDATION_POINTS: readonly Vec2[] = [
  vec(0.3, 0.3),
  vec(0.7, 0.3),
  vec(0.7, 0.7),
  vec(0.3, 0.7),
];

export interface DotTiming {
  /** How long each dot is shown. */
  readonly dwellMs: number;
  /** Initial part of the dwell ignored while the eyes move and settle. */
  readonly settleMs: number;
}

export const CALIBRATION_TIMING: DotTiming = { dwellMs: 2500, settleMs: 800 };
export const VALIDATION_TIMING: DotTiming = { dwellMs: 2000, settleMs: 800 };

/** A dot needs at least this many usable samples; otherwise it is shown again once. */
export const MIN_SAMPLES_PER_DOT = 10;
/** Calibration fails if fewer dots than this have enough samples. */
export const MIN_DOTS = 7;
export const TARGET_ERROR_PX = 150;

const LAMBDAS = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10];

export interface TimedInputs {
  readonly t: number;
  readonly inputs: GazeInputs;
}

export interface DotState {
  readonly index: number;
  readonly target: Vec2;
  /** 0 to 1 through the dwell. */
  readonly progress: number;
  readonly settling: boolean;
  /** Position in the sequence, counting retries, and total length. */
  readonly step: number;
  readonly steps: number;
}

/**
 * Shows dots one after another for a fixed time each, collecting samples once the
 * eyes have settled. Blinks and frames without a face are skipped. Dots that end up
 * short of samples are shown once more at the end.
 */
export class DotSequence {
  readonly points: readonly Vec2[];
  readonly samples: TimedInputs[][];
  private readonly timing: DotTiming;
  private readonly order: number[];
  private readonly retried = new Set<number>();
  private step = 0;
  private stepStart: number | null = null;

  constructor(points: readonly Vec2[], timing: DotTiming) {
    this.points = points;
    this.timing = timing;
    this.order = points.map((_, i) => i);
    this.samples = points.map(() => []);
  }

  get done(): boolean {
    return this.step >= this.order.length;
  }

  current(now: number): DotState | null {
    const index = this.order[this.step];
    const target = index === undefined ? undefined : this.points[index];
    if (index === undefined || !target) return null;
    const elapsed = this.stepStart === null ? 0 : now - this.stepStart;
    return {
      index,
      target,
      progress: Math.min(1, elapsed / this.timing.dwellMs),
      settling: elapsed < this.timing.settleMs,
      step: this.step,
      steps: this.order.length,
    };
  }

  /** Advances the clock to `now`, recording `sample` if it belongs to the current dot. */
  update(now: number, sample: GazeSample | null = null): void {
    if (this.done) return;
    this.stepStart ??= now;
    const index = this.order[this.step];
    if (index === undefined) return;

    if (sample?.inputs && !sample.blinking) {
      const elapsed = sample.t - this.stepStart;
      if (elapsed >= this.timing.settleMs && elapsed < this.timing.dwellMs) {
        this.samples[index]?.push({ t: sample.t, inputs: sample.inputs });
      }
    }

    if (now - this.stepStart >= this.timing.dwellMs) {
      this.step += 1;
      this.stepStart = now;
      if (this.step === this.order.length) this.queueRetries();
    }
  }

  private queueRetries(): void {
    this.samples.forEach((s, i) => {
      if (s.length < MIN_SAMPLES_PER_DOT && !this.retried.has(i)) {
        this.retried.add(i);
        this.order.push(i);
      }
    });
  }
}

export interface Screen {
  readonly width: number;
  readonly height: number;
}

export interface GazeModel {
  readonly ridge: RidgeModel;
  readonly screen: Screen;
  /** Leave-one-dot-out error during fitting, in px. */
  readonly cvErrorPx: number;
  readonly dotsUsed: number;
}

export const toPixels = (p: Vec2, screen: Screen): Vec2 =>
  vec(p.x * screen.width, p.y * screen.height);

/** Fits the gaze model from per-dot samples (one median feature row per dot). */
export function fitCalibration(seq: DotSequence, screen: Screen): GazeModel | null {
  const rows: number[][] = [];
  const targets: [number, number][] = [];
  seq.points.forEach((p, i) => {
    const samples = seq.samples[i] ?? [];
    if (samples.length < MIN_SAMPLES_PER_DOT) return;
    rows.push(columnMedians(samples.map((s) => featureVector(s.inputs))));
    const px = toPixels(p, screen);
    targets.push([px.x, px.y]);
  });
  if (rows.length < MIN_DOTS) return null;
  const fit = fitRidgeCv(rows, targets, LAMBDAS, FEATURE_FLOORS);
  if (!fit) return null;
  return { ridge: fit.model, screen, cvErrorPx: fit.cvError, dotsUsed: rows.length };
}

export function predictGaze(model: GazeModel, inputs: GazeInputs): Vec2 {
  const [x, y] = predictRidge(model.ridge, featureVector(inputs));
  return vec(x, y);
}

export interface ValidationResult {
  /** Median error over every filtered sample, in px; Infinity with no samples. */
  readonly medianErrorPx: number;
  /** Median error per dot, or null where a dot had no samples. */
  readonly perDotPx: readonly (number | null)[];
  readonly passed: boolean;
}

/** Measures error on the validation dots using the same filter the game uses. */
export function evaluateValidation(
  model: GazeModel,
  seq: DotSequence,
  filter: OneEuroOptions = GAZE_FILTER,
): ValidationResult {
  const all: number[] = [];
  const perDotPx = seq.points.map((p, i) => {
    const target = toPixels(p, model.screen);
    const fx = new OneEuroFilter(filter);
    const fy = new OneEuroFilter(filter);
    const errors = (seq.samples[i] ?? []).map((s) => {
      const raw = predictGaze(model, s.inputs);
      const point = vec(fx.filter(raw.x, s.t / 1000), fy.filter(raw.y, s.t / 1000));
      return distance(point, target);
    });
    all.push(...errors);
    return errors.length ? median(errors) : null;
  });
  const medianErrorPx = all.length ? median(all) : Infinity;
  return { medianErrorPx, perDotPx, passed: medianErrorPx <= TARGET_ERROR_PX };
}
