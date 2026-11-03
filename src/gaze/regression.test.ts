import { describe, expect, it } from 'vitest';
import { fitRidge, fitRidgeCv, predictRidge, type Output } from './regression';

const linear = (x: readonly number[]): Output => [
  100 + 300 * (x[0] ?? 0) - 50 * (x[1] ?? 0),
  -20 + 40 * (x[0] ?? 0) + 200 * (x[1] ?? 0),
];

const grid = [0, 0.5, 1].flatMap((a) => [0, 0.5, 1].map((b) => [a, b]));

describe('fitRidge', () => {
  it('recovers a linear map with little regularisation', () => {
    const model = fitRidge(grid, grid.map(linear), 1e-9, [0, 0]);
    expect(model).not.toBeNull();
    if (!model) return;
    const [x, y] = predictRidge(model, [0.25, 0.75]);
    const [ex, ey] = linear([0.25, 0.75]);
    expect(x).toBeCloseTo(ex, 3);
    expect(y).toBeCloseTo(ey, 3);
  });

  it('stays finite with a near-constant feature thanks to the floor', () => {
    const x = grid.map(([a = 0, b = 0], i) => [a, b, 0.3 + (i % 2) * 1e-7]);
    const model = fitRidge(x, grid.map(linear), 1e-3, [0, 0, 0.01]);
    expect(model).not.toBeNull();
    if (!model) return;
    const [px, py] = predictRidge(model, [0.5, 0.5, 0.5]);
    expect(Number.isFinite(px) && Number.isFinite(py)).toBe(true);
    // The floored feature has little leverage, so a large change barely moves the output.
    expect(Math.abs(px - linear([0.5, 0.5])[0])).toBeLessThan(5);
  });

  it('rejects empty or mismatched input', () => {
    expect(fitRidge([], [], 1, [])).toBeNull();
    expect(fitRidge([[1]], [], 1, [0])).toBeNull();
  });
});

describe('fitRidgeCv', () => {
  it('chooses a lambda and reports a small error on clean data', () => {
    const fit = fitRidgeCv(grid, grid.map(linear), [1e-6, 1e-3, 1, 100], [0, 0]);
    expect(fit).not.toBeNull();
    expect(fit?.model.lambda).toBeLessThan(1);
    expect(fit?.cvError).toBeLessThan(1);
  });
});
