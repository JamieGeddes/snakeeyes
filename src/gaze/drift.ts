import { distance, vec, type Vec2 } from '../game/vec';
import { median } from './linalg';

/** Gaze points from this window before eating count as "looking at the fruit", ms. */
const WINDOW_START_MS = 700;
const WINDOW_END_MS = 100;
const MIN_POINTS = 5;
/** Ignore a fruit if gaze was further than this from it: the player was looking elsewhere. */
const GATE_PX = 300;
/** Share of the error corrected per fruit. */
const RATE = 0.3;
/** The correction never grows beyond this, px. */
const MAX_OFFSET_PX = 250;
const HISTORY_MS = 1500;

/**
 * Corrects slow calibration drift during play. Each eaten fruit is assumed to have
 * been looked at just before, so part of the gap between gaze and fruit is added to
 * a screen-space offset.
 */
export class DriftCorrector {
  private correction: Vec2 = vec(0, 0);
  private history: { t: number; point: Vec2 }[] = [];

  get offset(): Vec2 {
    return this.correction;
  }

  /** Applies the correction to a raw gaze point and remembers the result. */
  apply(t: number, raw: Vec2): Vec2 {
    const point = vec(raw.x + this.correction.x, raw.y + this.correction.y);
    this.history.push({ t, point });
    while ((this.history[0]?.t ?? t) < t - HISTORY_MS) this.history.shift();
    return point;
  }

  /** Learns from a fruit eaten at `at` (screen px) at time `now`. Returns true if it was used. */
  fruitEaten(at: Vec2, now: number): boolean {
    const recent = this.history.filter(
      (h) => h.t >= now - WINDOW_START_MS && h.t <= now - WINDOW_END_MS,
    );
    if (recent.length < MIN_POINTS) return false;
    const looked = vec(median(recent.map((h) => h.point.x)), median(recent.map((h) => h.point.y)));
    if (distance(looked, at) > GATE_PX) return false;
    const next = vec(
      this.correction.x + RATE * (at.x - looked.x),
      this.correction.y + RATE * (at.y - looked.y),
    );
    const size = Math.hypot(next.x, next.y);
    const k = size > MAX_OFFSET_PX ? MAX_OFFSET_PX / size : 1;
    this.correction = vec(next.x * k, next.y * k);
    return true;
  }

  reset(): void {
    this.correction = vec(0, 0);
    this.history = [];
  }
}
