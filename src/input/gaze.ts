import type { GazeModel } from '../gaze/calibration';
import { GazeEstimator, type GazeEstimate } from '../gaze/estimator';
import type { GazeSample } from '../gaze/features';
import { PresenceMonitor, type LostReason } from '../gaze/presence';
import type { InputSample, InputSource } from './types';

const NO_ESTIMATE: GazeEstimate = { point: null, status: 'no-face' };

/** Steers towards where the player is looking, once a calibration model is set. */
export class GazeInput implements InputSource {
  private estimator: GazeEstimator | null = null;
  private estimate: GazeEstimate = NO_ESTIMATE;
  private calibration: GazeModel | null = null;
  private readonly presence = new PresenceMonitor();

  get model(): GazeModel | null {
    return this.calibration;
  }

  setModel(model: GazeModel): void {
    this.calibration = model;
    this.estimator = new GazeEstimator(model);
    this.estimate = NO_ESTIMATE;
  }

  update(sample: GazeSample): void {
    this.presence.update(sample);
    if (this.estimator) this.estimate = this.estimator.update(sample);
  }

  /** Why the player counts as gone at `now` (ms), or null if they're present. */
  lost(now: number): LostReason | null {
    return this.presence.lost(now);
  }

  sample(): InputSample {
    const { point, status } = this.estimate;
    const confidence = status === 'tracking' ? 1 : status === 'blink' ? 0.5 : 0;
    return { target: point, confidence };
  }

  dispose(): void {
    this.estimator = null;
    this.estimate = NO_ESTIMATE;
  }
}
