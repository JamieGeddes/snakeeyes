import type { GazeSample } from './features';

export type LostReason = 'no-face' | 'eyes-closed';

/** No face, or eyes shut, for longer than this pauses the game. Blinks are shorter. */
export const LOST_AFTER_MS = 500;

/** Tracks whether the player is still looking at the game. */
export class PresenceMonitor {
  private readonly lostAfterMs: number;
  private faceAt = -Infinity;
  private eyesOpenAt = -Infinity;

  constructor(lostAfterMs = LOST_AFTER_MS) {
    this.lostAfterMs = lostAfterMs;
  }

  update(sample: GazeSample): void {
    if (!sample.inputs) return;
    this.faceAt = sample.t;
    if (!sample.blinking) this.eyesOpenAt = sample.t;
  }

  /** Why the player counts as gone at `now` (ms), or null if they're present. No samples counts as no face. */
  lost(now: number): LostReason | null {
    if (now - this.faceAt > this.lostAfterMs) return 'no-face';
    if (now - this.eyesOpenAt > this.lostAfterMs) return 'eyes-closed';
    return null;
  }
}
