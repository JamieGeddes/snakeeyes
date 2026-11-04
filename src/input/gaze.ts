import type { GazeModel } from '../gaze/calibration';
import { GazeEstimator, type GazeEstimate } from '../gaze/estimator';
import { DriftCorrector } from '../gaze/drift';
import type { GazeSample } from '../gaze/features';
import type { Vec2 } from '../game/vec';
import { PresenceMonitor, type LostReason } from '../gaze/presence';
import type { InputSample, InputSource } from './types';

const NO_ESTIMATE: GazeEstimate = { point: null, status: 'no-face' };

/** Steers towards where the player is looking, once a calibration model is set. */
export class GazeInput implements InputSource {
  private estimator: GazeEstimator | null = null;
  private estimate: GazeEstimate = NO_ESTIMATE;
  private calibration: GazeModel | null = null;
  private readonly presence = new PresenceMonitor();
  private readonly drift = new DriftCorrector();
  private target: Vec2 | null = null;

  get model(): GazeModel | null {
    return this.calibration;
  }

  setModel(model: GazeModel): void {
    this.calibration = model;
    this.estimator = new GazeEstimator(model);
    this.estimate = NO_ESTIMATE;
    this.target = null;
    this.drift.reset();
  }

  update(sample: GazeSample): void {
    this.presence.update(sample);
    if (!this.estimator) return;
    const estimate = this.estimator.update(sample);
    this.estimate = estimate;
    if (!estimate.point) this.target = null;
    // Blinks hold the last corrected point; only fresh estimates are corrected and recorded.
    else if (estimate.status === 'tracking')
      this.target = this.drift.apply(sample.t, estimate.point);
  }

  /** Corrects calibration drift using a fruit the player just ate, assuming they looked at it. */
  fruitEaten(at: Vec2, now: number): void {
    this.drift.fruitEaten(at, now);
  }

  /** Why the player counts as gone at `now` (ms), or null if they're present. */
  lost(now: number): LostReason | null {
    return this.presence.lost(now);
  }

  sample(): InputSample {
    const { status } = this.estimate;
    const confidence = status === 'tracking' ? 1 : status === 'blink' ? 0.5 : 0;
    return { target: this.target, confidence };
  }

  dispose(): void {
    this.estimator = null;
    this.estimate = NO_ESTIMATE;
    this.target = null;
  }
}
