import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../game/random';
import {
  CALIBRATION_POINTS,
  CALIBRATION_TIMING,
  DotSequence,
  fitCalibration,
} from '../gaze/calibration';
import { runSequence, syntheticInputs } from '../gaze/simulate';
import { GazeInput } from './gaze';

const screen = { width: 1500, height: 900 };

function calibratedInput(): GazeInput {
  const seq = new DotSequence(CALIBRATION_POINTS, CALIBRATION_TIMING);
  runSequence(seq, screen, { noise: 0.0005 });
  const model = fitCalibration(seq, screen);
  if (!model) throw new Error('calibration failed');
  const input = new GazeInput();
  input.setModel(model);
  return input;
}

describe('GazeInput', () => {
  it('has no target before calibration', () => {
    const input = new GazeInput();
    input.update({
      t: 0,
      inputs: syntheticInputs({ x: 750, y: 450 }, screen, 0, Math.random),
      blinking: false,
    });
    expect(input.sample()).toEqual({ target: null, confidence: 0 });
  });

  it('steers towards the gaze point once calibrated', () => {
    const input = calibratedInput();
    const rng = mulberry32(3);
    const look = { x: 1200, y: 300 };
    for (let t = 0; t <= 1000; t += 33) {
      input.update({ t, inputs: syntheticInputs(look, screen, 0.0005, rng), blinking: false });
    }
    const { target, confidence } = input.sample();
    expect(confidence).toBe(1);
    expect(target).not.toBeNull();
    expect(Math.hypot((target?.x ?? 0) - look.x, (target?.y ?? 0) - look.y)).toBeLessThan(100);
    expect(input.lost(1000)).toBeNull();
  });

  it('holds the target through a blink and reports eyes closed when held shut', () => {
    const input = calibratedInput();
    const inputs = syntheticInputs({ x: 300, y: 600 }, screen, 0, Math.random);
    input.update({ t: 0, inputs, blinking: false });
    const held = input.sample().target;
    input.update({ t: 100, inputs, blinking: true });
    expect(input.sample()).toEqual({ target: held, confidence: 0.5 });
    for (let t = 133; t <= 800; t += 33) input.update({ t, inputs, blinking: true });
    expect(input.lost(800)).toBe('eyes-closed');
  });

  it('corrects drift from eaten fruit', () => {
    const input = calibratedInput();
    const inputs = syntheticInputs({ x: 750, y: 450 }, screen, 0, Math.random);
    for (let t = 0; t <= 1000; t += 33) input.update({ t, inputs, blinking: false });
    const before = input.sample().target;
    if (!before) throw new Error('no target');
    // The player was looking at a fruit 80 px to the right of where we think.
    input.fruitEaten({ x: before.x + 80, y: before.y }, 1000);
    input.update({ t: 1033, inputs, blinking: false });
    expect((input.sample().target?.x ?? 0) - before.x).toBeCloseTo(24, 0);
  });

  it('drops the target and reports no face when the face goes', () => {
    const input = calibratedInput();
    input.update({
      t: 0,
      inputs: syntheticInputs({ x: 300, y: 600 }, screen, 0, Math.random),
      blinking: false,
    });
    for (let t = 33; t <= 700; t += 33) input.update({ t, inputs: null, blinking: false });
    expect(input.sample()).toEqual({ target: null, confidence: 0 });
    expect(input.lost(700)).toBe('no-face');
  });
});
