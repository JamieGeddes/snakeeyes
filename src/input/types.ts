import type { Vec2 } from '../game/vec';

export interface InputSample {
  /** Where the player wants the snake to go, in screen space; null when unknown. */
  readonly target: Vec2 | null;
  /** 0 to 1. Gaze input will report tracking confidence here. */
  readonly confidence: number;
}

export interface InputSource {
  sample(): InputSample;
  dispose(): void;
}

/** Used when no input is available yet. */
export const noInput: InputSource = {
  sample: () => ({ target: null, confidence: 0 }),
  dispose: () => undefined,
};
