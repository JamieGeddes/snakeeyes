import { describe, expect, it } from 'vitest';
import { columnMedians, median, solve } from './linalg';

describe('solve', () => {
  it('solves a small system', () => {
    const x = solve(
      [
        [2, 1, -1],
        [-3, -1, 2],
        [-2, 1, 2],
      ],
      [8, -11, -3],
    );
    expect(x?.[0]).toBeCloseTo(2);
    expect(x?.[1]).toBeCloseTo(3);
    expect(x?.[2]).toBeCloseTo(-1);
  });

  it('needs pivoting when the first pivot is zero', () => {
    const x = solve(
      [
        [0, 1],
        [1, 0],
      ],
      [3, 4],
    );
    expect(x).toEqual([4, 3]);
  });

  it('returns null for a singular matrix', () => {
    expect(
      solve(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toBeNull();
  });
});

describe('median', () => {
  it('handles odd, even and empty inputs', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
  });

  it('takes medians per column', () => {
    expect(
      columnMedians([
        [1, 10],
        [3, 30],
        [2, 99],
      ]),
    ).toEqual([2, 30]);
  });
});
