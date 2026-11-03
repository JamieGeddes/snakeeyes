import { describe, expect, it } from 'vitest';
import { add, distance, scale, sub, vec, wrap } from './vec';

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
