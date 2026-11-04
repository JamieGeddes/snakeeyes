import { clamp, vec, type Vec2 } from '../game/vec';
import { predictGaze, type GazeModel } from './calibration';
import type { GazeSample } from './features';
import { GAZE_FILTER, OneEuroFilter, type OneEuroOptions } from './oneEuro';

export type GazeStatus = 'tracking' | 'blink' | 'no-face';

export interface GazeEstimate {
  /** Filtered gaze point in screen px; held during blinks, null with no face. */
  readonly point: Vec2 | null;
  readonly status: GazeStatus;
}

/** After a gap this long without a face, the filter restarts rather than gliding. */
const RESET_AFTER_MS = 300;
/** Predictions may overshoot the screen slightly; beyond that they are clamped. */
const OVERSHOOT = 0.05;

export class GazeEstimator {
  private readonly model: GazeModel;
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;
  private last: Vec2 | null = null;
  private lastFaceAt = -Infinity;

  constructor(model: GazeModel, filter: OneEuroOptions = GAZE_FILTER) {
    this.model = model;
    this.fx = new OneEuroFilter(filter);
    this.fy = new OneEuroFilter(filter);
  }

  update(sample: GazeSample): GazeEstimate {
    if (!sample.inputs) {
      this.last = null;
      return { point: null, status: 'no-face' };
    }
    if (sample.t - this.lastFaceAt > RESET_AFTER_MS) {
      this.fx.reset();
      this.fy.reset();
    }
    this.lastFaceAt = sample.t;
    if (sample.blinking) return { point: this.last, status: 'blink' };

    const { width, height } = this.model.screen;
    const raw = predictGaze(this.model, sample.inputs);
    if (!raw) return { point: this.last, status: 'tracking' };
    const x = clamp(raw.x, -OVERSHOOT * width, (1 + OVERSHOOT) * width);
    const y = clamp(raw.y, -OVERSHOOT * height, (1 + OVERSHOOT) * height);
    const t = sample.t / 1000;
    this.last = vec(this.fx.filter(x, t), this.fy.filter(y, t));
    return { point: this.last, status: 'tracking' };
  }
}
