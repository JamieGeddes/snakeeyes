import { describe, expect, it } from 'vitest';
import { vec } from '../game/vec';
import {
  CALIBRATION_POINTS,
  CALIBRATION_TIMING,
  DotSequence,
  evaluateValidation,
  fitCalibration,
  fitRidgeCalibration,
  HEAD_MOVE_POINTS,
  HEAD_MOVE_TIMING,
  HEAD_TEST_POINTS,
  HEAD_TEST_TIMING,
  MIN_SAMPLES_PER_DOT,
  predictGaze,
  VALIDATION_POINTS,
  VALIDATION_TIMING,
} from './calibration';
import type { GazeInputs } from './features';
import { headSweep, naturalHead, runSequence, syntheticInputs } from './simulate';
import { mulberry32 } from '../game/random';

const screen = { width: 1500, height: 900 };
const inputs: GazeInputs = syntheticInputs({ x: 750, y: 450 }, screen, 0, Math.random);

/** Calibration dots with a still head, then the head-move step. */
function calibrate(seed = 2): { cal: DotSequence; move: DotSequence } {
  const cal = new DotSequence(CALIBRATION_POINTS, CALIBRATION_TIMING);
  runSequence(cal, screen, { seed, poseNoise: 0.003 });
  const move = new DotSequence(HEAD_MOVE_POINTS, HEAD_MOVE_TIMING);
  runSequence(move, screen, {
    seed: seed + 1,
    poseNoise: 0.003,
    head: headSweep(HEAD_MOVE_TIMING.dwellMs),
  });
  return { cal, move };
}

describe('DotSequence', () => {
  const timing = { dwellMs: 1000, settleMs: 400 };

  it('ignores samples while settling and after the dwell', () => {
    const seq = new DotSequence([vec(0.5, 0.5), vec(0.1, 0.1)], timing);
    seq.update(0);
    seq.update(100, { t: 100, inputs, blinking: false });
    seq.update(500, { t: 500, inputs, blinking: false });
    expect(seq.samples[0]).toHaveLength(1);
    expect(seq.current(500)).toMatchObject({ index: 0, settling: false, progress: 0.5 });
  });

  it('skips blinks and frames without a face', () => {
    const seq = new DotSequence([vec(0.5, 0.5)], timing);
    seq.update(0);
    seq.update(500, { t: 500, inputs, blinking: true });
    seq.update(600, { t: 600, inputs: null, blinking: false });
    expect(seq.samples[0]).toHaveLength(0);
  });

  it('advances after the dwell and finishes', () => {
    const seq = new DotSequence([vec(0.5, 0.5), vec(0.1, 0.1)], timing);
    for (let t = 0; t <= 1000; t += 50) seq.update(t, { t, inputs, blinking: false });
    expect(seq.current(1000)?.index).toBe(1);
    for (let t = 1050; t <= 2000; t += 50) seq.update(t, { t, inputs, blinking: false });
    expect(seq.done).toBe(true);
    expect(seq.current(2000)).toBeNull();
  });

  it('shows a dot again once when it is short of samples', () => {
    const seq = new DotSequence(CALIBRATION_POINTS, CALIBRATION_TIMING);
    runSequence(seq, screen, { skip: (i) => i === 4 });
    // Dot 4 was retried but the synthetic eye still "looked away".
    expect(seq.samples[4]).toHaveLength(0);
    expect(seq.samples[0]?.length).toBeGreaterThanOrEqual(MIN_SAMPLES_PER_DOT);
  });
});

describe('fitCalibration and evaluateValidation', () => {
  it('maps a synthetic eye to the screen accurately', () => {
    const cal = new DotSequence(CALIBRATION_POINTS, CALIBRATION_TIMING);
    runSequence(cal, screen, { seed: 2 });
    const model = fitCalibration(cal, screen);
    expect(model).not.toBeNull();
    if (!model) return;
    expect(model.dotsUsed).toBe(9);

    const val = new DotSequence(VALIDATION_POINTS, VALIDATION_TIMING);
    runSequence(val, screen, { seed: 3 });
    const result = evaluateValidation(model, val);
    expect(result.medianErrorPx).toBeLessThan(40);
    expect(result.passed).toBe(true);
    expect(result.perDotPx.every((e) => e !== null)).toBe(true);
  });

  it('predicts unseen points between dots', () => {
    const cal = new DotSequence(CALIBRATION_POINTS, CALIBRATION_TIMING);
    runSequence(cal, screen, { noise: 0 });
    const model = fitCalibration(cal, screen);
    if (!model) throw new Error('fit failed');
    const target = vec(400, 650);
    const p = predictGaze(model, syntheticInputs(target, screen, 0, mulberry32(1)));
    expect(p).not.toBeNull();
    expect(Math.hypot((p?.x ?? 0) - target.x, (p?.y ?? 0) - target.y)).toBeLessThan(25);
  });

  it('stays accurate while the head moves naturally, unlike the ridge model', () => {
    const { cal, move } = calibrate();
    const model = fitCalibration(cal, screen, move);
    const ridge = fitRidgeCalibration(cal, screen);
    if (!model || !ridge) throw new Error('fit failed');
    expect(model.headRange.yaw).toBeGreaterThan(0.2);

    const val = new DotSequence(HEAD_TEST_POINTS, HEAD_TEST_TIMING);
    runSequence(val, screen, { seed: 9, poseNoise: 0.003, head: naturalHead() });
    const geometric = evaluateValidation(model, val).medianErrorPx;
    const baseline = evaluateValidation(ridge, val).medianErrorPx;

    // Simulated: about 21 px for the geometric model, thousands for the ridge one.
    expect(geometric).toBeLessThan(40);
    expect(baseline).toBeGreaterThan(geometric * 5);
  });

  it('fails when too few dots have samples', () => {
    const cal = new DotSequence(CALIBRATION_POINTS, CALIBRATION_TIMING);
    runSequence(cal, screen, { skip: (i) => i < 4 });
    expect(fitCalibration(cal, screen)).toBeNull();
  });

  it('reports no accuracy when validation has no samples', () => {
    const cal = new DotSequence(CALIBRATION_POINTS, CALIBRATION_TIMING);
    runSequence(cal, screen);
    const model = fitCalibration(cal, screen);
    if (!model) throw new Error('fit failed');
    const val = new DotSequence(VALIDATION_POINTS, VALIDATION_TIMING);
    runSequence(val, screen, { skip: () => true });
    const result = evaluateValidation(model, val);
    expect(result.medianErrorPx).toBe(Infinity);
    expect(result.passed).toBe(false);
  });
});
