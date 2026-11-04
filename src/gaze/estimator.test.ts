import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../game/random';
import { vec } from '../game/vec';
import { CALIBRATION_POINTS, CALIBRATION_TIMING, DotSequence, fitCalibration } from './calibration';
import { GazeEstimator } from './estimator';
import { BLINK_THRESHOLD, featureVector, FEATURE_FLOORS, toGazeSample } from './features';
import { runSequence, syntheticInputs } from './simulate';

const screen = { width: 1500, height: 900 };

function model() {
  const cal = new DotSequence(CALIBRATION_POINTS, CALIBRATION_TIMING);
  runSequence(cal, screen, { noise: 0 });
  const m = fitCalibration(cal, screen);
  if (!m) throw new Error('fit failed');
  return m;
}

const look = (x: number, y: number) => syntheticInputs(vec(x, y), screen, 0, mulberry32(1));

describe('GazeEstimator', () => {
  it('estimates where the player is looking', () => {
    const est = new GazeEstimator(model());
    let e = est.update({ t: 0, inputs: look(300, 200), blinking: false });
    for (let t = 33; t < 1000; t += 33)
      e = est.update({ t, inputs: look(300, 200), blinking: false });
    expect(e.status).toBe('tracking');
    expect(Math.hypot((e.point?.x ?? 0) - 300, (e.point?.y ?? 0) - 200)).toBeLessThan(25);
  });

  it('holds the last point through a blink', () => {
    const est = new GazeEstimator(model());
    const before = est.update({ t: 0, inputs: look(800, 400), blinking: false });
    const during = est.update({ t: 33, inputs: look(100, 100), blinking: true });
    expect(during.status).toBe('blink');
    expect(during.point).toEqual(before.point);
  });

  it('reports no face', () => {
    const est = new GazeEstimator(model());
    expect(est.update({ t: 0, inputs: null, blinking: false })).toEqual({
      point: null,
      status: 'no-face',
    });
  });

  it('restarts the filter after a gap instead of gliding', () => {
    const est = new GazeEstimator(model());
    for (let t = 0; t < 600; t += 33) est.update({ t, inputs: look(100, 100), blinking: false });
    est.update({ t: 633, inputs: null, blinking: false });
    const e = est.update({ t: 1500, inputs: look(1400, 800), blinking: false });
    expect(Math.hypot((e.point?.x ?? 0) - 1400, (e.point?.y ?? 0) - 800)).toBeLessThan(25);
  });
});

describe('gaze features', () => {
  it('has a floor for every feature', () => {
    expect(featureVector(look(0, 0))).toHaveLength(FEATURE_FLOORS.length);
  });

  it('converts tracking samples, flagging blinks', () => {
    const face = {
      iris: { x: 0.5, y: 0.5, openness: 0.4 },
      pose: { yaw: 0, pitch: 0, roll: 0 },
      position: null,
      blink: { left: BLINK_THRESHOLD + 0.1, right: 0 },
    };
    expect(toGazeSample({ t: 5, inferenceMs: 1, face }).blinking).toBe(true);
    expect(toGazeSample({ t: 5, inferenceMs: 1, face: null })).toEqual({
      t: 5,
      inputs: null,
      blinking: false,
    });
  });
});
