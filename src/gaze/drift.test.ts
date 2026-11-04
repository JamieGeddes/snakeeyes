import { describe, expect, it } from 'vitest';
import { vec } from '../game/vec';
import { DriftCorrector } from './drift';

/** Feeds a steady raw gaze point for `ms` ending at `end`. */
function look(d: DriftCorrector, raw: { x: number; y: number }, end: number, ms = 800): void {
  for (let t = end - ms; t <= end; t += 33) d.apply(t, raw);
}

describe('DriftCorrector', () => {
  it('starts with no correction', () => {
    const d = new DriftCorrector();
    expect(d.apply(0, vec(10, 20))).toEqual(vec(10, 20));
  });

  it('moves part of the way towards an eaten fruit the player was looking at', () => {
    const d = new DriftCorrector();
    look(d, vec(500, 300), 1000);
    expect(d.fruitEaten(vec(600, 300), 1000)).toBe(true);
    expect(d.offset.x).toBeCloseTo(30);
    expect(d.apply(1033, vec(500, 300)).x).toBeCloseTo(530);
  });

  it('converges over several fruit', () => {
    const d = new DriftCorrector();
    for (let i = 1; i <= 20; i++) {
      look(d, vec(500, 300), i * 1000);
      d.fruitEaten(vec(560, 260), i * 1000);
    }
    expect(d.offset.x).toBeCloseTo(60, 0);
    expect(d.offset.y).toBeCloseTo(-40, 0);
  });

  it('ignores fruit the player was not looking at', () => {
    const d = new DriftCorrector();
    look(d, vec(100, 100), 1000);
    expect(d.fruitEaten(vec(900, 700), 1000)).toBe(false);
    expect(d.offset).toEqual(vec(0, 0));
  });

  it('ignores fruit with too little recent gaze', () => {
    const d = new DriftCorrector();
    d.apply(900, vec(500, 300));
    expect(d.fruitEaten(vec(520, 300), 1000)).toBe(false);
  });

  it('caps the correction', () => {
    const d = new DriftCorrector();
    for (let i = 1; i <= 40; i++) {
      look(d, vec(500, 300), i * 1000);
      // Always 290 px off, just inside the gate.
      const raw = d.apply(i * 1000, vec(500, 300));
      d.fruitEaten(vec(raw.x + 290, 300), i * 1000);
    }
    expect(Math.hypot(d.offset.x, d.offset.y)).toBeLessThanOrEqual(250.001);
  });

  it('resets', () => {
    const d = new DriftCorrector();
    look(d, vec(500, 300), 1000);
    d.fruitEaten(vec(600, 300), 1000);
    d.reset();
    expect(d.offset).toEqual(vec(0, 0));
  });
});
