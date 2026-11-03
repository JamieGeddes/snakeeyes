import { describe, expect, it } from 'vitest';
import { add, angleDiff, distance, scale, sub, torusDistance, vec, wrap } from './vec';

describe('vec', () => {
  it('adds, subtracts and scales', () => {
    expect(add(vec(1, 2), vec(3, 4))).toEqual(vec(4, 6));
    expect(sub(vec(1, 2), vec(3, 4))).toEqual(vec(-2, -2));
    expect(scale(vec(1, -2), 3)).toEqual(vec(3, -6));
  });

  it('measures distance', () => {
    expect(distance(vec(0, 0), vec(3, 4))).toBe(5);
  });

  it('wraps points past each edge back onto the board', () => {
    expect(wrap(vec(105, 50), 100, 80)).toEqual(vec(5, 50));
    expect(wrap(vec(-5, 50), 100, 80)).toEqual(vec(95, 50));
    expect(wrap(vec(50, 85), 100, 80)).toEqual(vec(50, 5));
    expect(wrap(vec(50, -5), 100, 80)).toEqual(vec(50, 75));
    expect(wrap(vec(50, 40), 100, 80)).toEqual(vec(50, 40));
  });
});

describe('angles and torus distance', () => {
  it('finds the shortest signed rotation', () => {
    expect(angleDiff(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(angleDiff(Math.PI * 0.9, -Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.2);
    expect(angleDiff(0, 4 * Math.PI + 0.1)).toBeCloseTo(0.1);
  });

  it('measures distance the short way round wrapped edges', () => {
    expect(torusDistance(vec(5, 50), vec(95, 50), 100, 80)).toBeCloseTo(10);
    expect(torusDistance(vec(50, 2), vec(50, 78), 100, 80)).toBeCloseTo(4);
    expect(torusDistance(vec(205, 50), vec(5, 50), 100, 80)).toBeCloseTo(0);
  });
});
