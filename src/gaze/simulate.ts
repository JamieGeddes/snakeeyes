import { mulberry32 } from '../game/random';
import type { Vec2 } from '../game/vec';
import type { DotSequence, Screen } from './calibration';
import type { GazeInputs, GazeSample } from './features';

/** A synthetic eye: iris and lids respond linearly to where the player looks, plus noise. */
export function syntheticInputs(
  target: Vec2,
  screen: Screen,
  noise: number,
  rng: () => number,
): GazeInputs {
  const u = target.x / screen.width - 0.5;
  const v = target.y / screen.height - 0.5;
  const n = (): number => (rng() - 0.5) * 2 * noise;
  return {
    iris: { x: 0.5 - 0.1 * u + n(), y: 0.5 + 0.03 * v + n(), openness: 0.38 - 0.04 * v + n() },
    pose: { yaw: 0.02 * u + n(), pitch: -0.01 * v + n(), roll: 0 },
  };
}

/** Runs a sequence at 30 fps with a synthetic eye looking at each dot. */
export function runSequence(
  seq: DotSequence,
  screen: Screen,
  options: { noise?: number; seed?: number; skip?: (index: number) => boolean } = {},
): void {
  const rng = mulberry32(options.seed ?? 1);
  let t = 0;
  for (let guard = 0; !seq.done && guard < 100_000; guard++) {
    const dot = seq.current(t);
    if (!dot) break;
    const target = { x: dot.target.x * screen.width, y: dot.target.y * screen.height };
    const sample: GazeSample = {
      t,
      inputs: options.skip?.(dot.index)
        ? null
        : syntheticInputs(target, screen, options.noise ?? 0.001, rng),
      blinking: false,
    };
    seq.update(t, sample);
    t += 1000 / 30;
  }
}
