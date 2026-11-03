import { describe, expect, it } from 'vitest';
import { RateMeter, WindowStats } from './stats';

describe('RateMeter', () => {
  it('reports events per second over the window', () => {
    const m = new RateMeter(1000);
    for (let t = 0; t < 1000; t += 40) m.tick(t);
    expect(m.rate(999)).toBe(25);
  });

  it('forgets events older than the window', () => {
    const m = new RateMeter(1000);
    m.tick(0);
    m.tick(500);
    expect(m.rate(1200)).toBe(1);
  });
});

describe('WindowStats', () => {
  it('computes mean, std, range and percentile', () => {
    const s = new WindowStats(10_000);
    [2, 4, 4, 4, 5, 5, 7, 9].forEach((v, i) => s.add(i, v));
    expect(s.mean).toBe(5);
    expect(s.std).toBeCloseTo(2.138, 3);
    expect(s.range).toBe(7);
    expect(s.percentile(0.5)).toBe(4);
    expect(s.percentile(1)).toBe(9);
  });

  it('drops samples older than the window', () => {
    const s = new WindowStats(100);
    s.add(0, 100);
    s.add(150, 1);
    expect(s.count).toBe(1);
    expect(s.mean).toBe(1);
  });

  it('is zero when empty', () => {
    const s = new WindowStats(100);
    expect(s.mean).toBe(0);
    expect(s.std).toBe(0);
    expect(s.range).toBe(0);
  });
});
