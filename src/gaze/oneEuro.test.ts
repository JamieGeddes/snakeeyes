import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../game/random';
import { GAZE_FILTER, OneEuroFilter } from './oneEuro';

const std = (v: number[]): number => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
};

describe('OneEuroFilter', () => {
  it('passes the first value through', () => {
    expect(new OneEuroFilter(GAZE_FILTER).filter(42, 0)).toBe(42);
  });

  it('reduces jitter while fixating', () => {
    const f = new OneEuroFilter(GAZE_FILTER);
    const rng = mulberry32(5);
    const raw: number[] = [];
    const out: number[] = [];
    for (let i = 0; i < 120; i++) {
      const x = 500 + (rng() - 0.5) * 40;
      raw.push(x);
      out.push(f.filter(x, i / 30));
    }
    expect(std(out.slice(30))).toBeLessThan(std(raw.slice(30)) / 3);
  });

  it('follows a large jump within a few hundred milliseconds', () => {
    const f = new OneEuroFilter(GAZE_FILTER);
    for (let i = 0; i < 30; i++) f.filter(100, i / 30);
    let y = 0;
    for (let i = 30; i < 39; i++) y = f.filter(1300, i / 30); // 300 ms after the jump
    expect(y).toBeGreaterThan(1000);
  });

  it('ignores repeated timestamps and can be reset', () => {
    const f = new OneEuroFilter(GAZE_FILTER);
    f.filter(10, 1);
    expect(f.filter(99, 1)).toBe(10);
    f.reset();
    expect(f.filter(99, 2)).toBe(99);
  });
});
