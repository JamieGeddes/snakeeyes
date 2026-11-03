import { solve } from './linalg';

/**
 * Ridge regression from feature vectors to 2D outputs. Features are standardised;
 * each feature's scale is floored so a near-constant feature can't explode.
 */
export interface RidgeModel {
  readonly mean: readonly number[];
  readonly scale: readonly number[];
  /** Per output: intercept followed by one weight per feature. */
  readonly weights: readonly [readonly number[], readonly number[]];
  readonly lambda: number;
}

export type Output = readonly [number, number];

export function fitRidge(
  x: readonly (readonly number[])[],
  y: readonly Output[],
  lambda: number,
  floors: readonly number[],
): RidgeModel | null {
  const n = x.length;
  const d = x[0]?.length ?? 0;
  if (n === 0 || d === 0 || y.length !== n) return null;

  const mean = Array.from({ length: d }, (_, j) => x.reduce((s, r) => s + (r[j] ?? 0), 0) / n);
  const scale = mean.map((m, j) => {
    const v = x.reduce((s, r) => s + ((r[j] ?? 0) - m) ** 2, 0) / n;
    return Math.max(Math.sqrt(v), floors[j] ?? 0, 1e-9);
  });
  const z = x.map((r) => [1, ...r.map((v, j) => (v - (mean[j] ?? 0)) / (scale[j] ?? 1))]);

  // Normal equations (ZᵀZ + λI') w = Zᵀy, leaving the intercept unpenalised.
  const p = d + 1;
  const a = Array.from({ length: p }, (_, i) =>
    Array.from(
      { length: p },
      (_, j) =>
        z.reduce((s, r) => s + (r[i] ?? 0) * (r[j] ?? 0), 0) + (i === j && i > 0 ? lambda : 0),
    ),
  );
  const fitOutput = (k: 0 | 1): number[] | null =>
    solve(
      a,
      Array.from({ length: p }, (_, i) =>
        z.reduce((s, r, row) => s + (r[i] ?? 0) * (y[row]?.[k] ?? 0), 0),
      ),
    );
  const wx = fitOutput(0);
  const wy = fitOutput(1);
  if (!wx || !wy) return null;
  return { mean, scale, weights: [wx, wy], lambda };
}

export function predictRidge(model: RidgeModel, features: readonly number[]): Output {
  const z = [1, ...features.map((v, j) => (v - (model.mean[j] ?? 0)) / (model.scale[j] ?? 1))];
  const dot = (w: readonly number[]): number => w.reduce((s, wi, i) => s + wi * (z[i] ?? 0), 0);
  return [dot(model.weights[0]), dot(model.weights[1])];
}

export interface CrossValidatedFit {
  readonly model: RidgeModel;
  /** Mean leave-one-out Euclidean error for the chosen lambda, in output units. */
  readonly cvError: number;
}

/** Picks lambda by leave-one-out cross-validation, then refits on all rows. */
export function fitRidgeCv(
  x: readonly (readonly number[])[],
  y: readonly Output[],
  lambdas: readonly number[],
  floors: readonly number[],
): CrossValidatedFit | null {
  let best: { lambda: number; error: number } | null = null;
  for (const lambda of lambdas) {
    let total = 0;
    let ok = true;
    for (let i = 0; i < x.length && ok; i++) {
      const m = fitRidge(
        x.filter((_, r) => r !== i),
        y.filter((_, r) => r !== i),
        lambda,
        floors,
      );
      const xi = x[i];
      const yi = y[i];
      if (!m || !xi || !yi) {
        ok = false;
        break;
      }
      const [px, py] = predictRidge(m, xi);
      total += Math.hypot(px - yi[0], py - yi[1]);
    }
    if (!ok) continue;
    const error = total / x.length;
    if (!best || error < best.error) best = { lambda, error };
  }
  if (!best) return null;
  const model = fitRidge(x, y, best.lambda, floors);
  return model ? { model, cvError: best.error } : null;
}
