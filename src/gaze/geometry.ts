import { vec, type Vec2 } from '../game/vec';
import type { Screen } from './calibration';
import type { GazeInputs } from './features';
import { solve } from './linalg';

/**
 * Geometric gaze model.
 *
 * The eye's direction in the head's frame comes from the iris position, corrected
 * for the camera's viewing angle: when the head turns, the iris shifts against the
 * eye corners in the image even if the eye hasn't moved, because the iris sits in
 * front of them. That direction is rotated by the head pose into camera space and
 * the ray from the head is intersected with the screen, taken as the camera's
 * z = 0 plane (the camera sits in the screen's bezel). The hit point in cm maps to
 * screen px by an offset and a fixed scale.
 *
 * The px-per-cm scale and the eye gains trade off against each other almost
 * exactly, so the scale is fixed and the gains absorb any difference.
 */

/** Typical CSS px per cm; any error is absorbed by the fitted eye gains. */
const PX_PER_CM = 40;
/** Typical eye openness, so its gain starts from a sensible centre. */
const OPENNESS_REF = 0.3;
/**
 * Midpoint of the two eyeball centres in MediaPipe's canonical face frame, cm. From
 * the eye-corner vertices of canonical_face_model.obj (Apache-2.0): corners average
 * (±3.15, 2.62, 3.47); the eyeballs' centres of rotation sit about 0.8 cm further back.
 */
export const EYE_OFFSET = [0, 2.6, 2.7] as const;

/** Parameter order in `theta`. */
export const PARAM = {
  ax: 0,
  ay: 1,
  px: 2,
  qx: 3,
  cx: 4,
  py: 5,
  po: 6,
  qy: 7,
  cy: 8,
} as const;
const PARAM_COUNT = 9;

/** The camera sits about this far above the screen's top edge, px. */
const CAMERA_ABOVE_PX = 40;

interface Prior {
  readonly index: number;
  readonly mean: (screen: Screen) => number;
  readonly sd: number;
}

/**
 * Weak priors. The camera's place on the screen plane (top centre, give or take) pins
 * down the offsets, which otherwise trade against the eye-angle constants. Gains are
 * pulled gently towards 0 so terms the data can't pin down stay small.
 */
const PRIORS: readonly Prior[] = [
  { index: PARAM.ax, mean: (s) => s.width / 2, sd: 200 },
  { index: PARAM.ay, mean: () => -CAMERA_ABOVE_PX, sd: 120 },
  { index: PARAM.px, mean: () => 0, sd: 10 },
  { index: PARAM.qx, mean: () => 0, sd: 2 },
  { index: PARAM.cx, mean: () => 0, sd: 2 },
  { index: PARAM.py, mean: () => 0, sd: 10 },
  { index: PARAM.po, mean: () => 0, sd: 10 },
  { index: PARAM.qy, mean: () => 0, sd: 2 },
  { index: PARAM.cy, mean: () => 0, sd: 2 },
];
/** Residual, in px, of a parameter one prior SD from its mean. */
const PRIOR_PX = 5;
/** Residual for a sample whose gaze ray misses the screen plane. */
const MISS_PX = 1e4;

export type Sign = 1 | -1;

export interface GeometricParams {
  readonly theta: readonly number[];
  /** Screen x and y direction relative to camera x and y. */
  readonly sx: Sign;
  readonly sy: Sign;
  /** Whether the face's canonical forward axis is +z or -z in its own frame. */
  readonly forward: Sign;
}

export interface FitRow {
  readonly inputs: GazeInputs;
  /** Where the player was looking, in screen px. */
  readonly target: Vec2;
}

/** Predicted gaze point in screen px, or null if the gaze ray misses the screen plane. */
export function projectGaze(params: GeometricParams, inputs: GazeInputs): Vec2 | null {
  const { theta, sx, sy, forward } = params;
  const p = (i: number): number => theta[i] ?? 0;
  const r = inputs.head.rotation;
  const R = (i: number): number => r[i] ?? 0;
  const [hx, hy, hz] = inputs.head.position;
  // Eye midpoint in camera space; the face origin MediaPipe reports is behind the eyes.
  const [ox, oy, oz] = [EYE_OFFSET[0], EYE_OFFSET[1], forward * EYE_OFFSET[2]];
  const tx = hx + R(0) * ox + R(1) * oy + R(2) * oz;
  const ty = hy + R(3) * ox + R(4) * oy + R(5) * oz;
  const tz = hz + R(6) * ox + R(7) * oy + R(8) * oz;

  // Direction from the eyes to the camera, in the head's frame: Rᵀ(-t).
  const cxh = -(R(0) * tx + R(3) * ty + R(6) * tz);
  const cyh = -(R(1) * tx + R(4) * ty + R(7) * tz);
  const czh = forward * -(R(2) * tx + R(5) * ty + R(8) * tz);
  if (czh <= 0) return null;
  const vx = cxh / czh;
  const vy = cyh / czh;

  // Eye direction in the head's frame, as tangents of yaw and pitch.
  const { iris } = inputs;
  const ex = p(PARAM.px) * (iris.x - 0.5) + p(PARAM.qx) * vx + p(PARAM.cx);
  const ey =
    p(PARAM.py) * (iris.y - 0.5) +
    p(PARAM.po) * (iris.openness - OPENNESS_REF) +
    p(PARAM.qy) * vy +
    p(PARAM.cy);

  // Rotate into camera space and intersect with z = 0.
  const gx = R(0) * ex + R(1) * ey + R(2) * forward;
  const gy = R(3) * ex + R(4) * ey + R(5) * forward;
  const gz = R(6) * ex + R(7) * ey + R(8) * forward;
  const lambda = -tz / gz;
  if (!Number.isFinite(lambda) || lambda <= 0) return null;
  const hitX = tx + lambda * gx;
  const hitY = ty + lambda * gy;
  return vec(p(PARAM.ax) + sx * PX_PER_CM * hitX, p(PARAM.ay) + sy * PX_PER_CM * hitY);
}

/** The face's forward axis sign: whichever of ±z points from the head towards the camera. */
export function forwardSign(rows: readonly FitRow[]): Sign {
  let votes = 0;
  for (const { inputs } of rows) {
    const r = inputs.head.rotation;
    const [tx, ty, tz] = inputs.head.position;
    const towardsCamera = -((r[2] ?? 0) * tx + (r[5] ?? 0) * ty + (r[8] ?? 0) * tz);
    votes += Math.sign(towardsCamera);
  }
  return votes >= 0 ? 1 : -1;
}

export interface GeometricFit {
  readonly params: GeometricParams;
  /** Root mean square error over the rows, in px. */
  readonly rmsPx: number;
}

/**
 * Screen orientation in MediaPipe's camera space (x right and y up in the image).
 * The camera faces the player, so the player's right, and screen x, is camera -x;
 * screen y runs down, camera y up. Fixed rather than fitted: for head rotation the
 * two choices fit almost equally well, but only the right one handles leaning.
 */
export const SCREEN_SX: Sign = -1;
export const SCREEN_SY: Sign = -1;

/** Fits the model to calibration rows. */
export function fitGeometric(rows: readonly FitRow[], screen: Screen): GeometricFit | null {
  if (rows.length === 0) return null;
  return fitWithSigns(rows, screen, SCREEN_SX, SCREEN_SY, forwardSign(rows));
}

/** Fits with a given orientation, e.g. the one from a full fit for cross-validation. */
export function fitWithSigns(
  rows: readonly FitRow[],
  screen: Screen,
  sx: Sign,
  sy: Sign,
  forward: Sign,
): GeometricFit | null {
  if (rows.length === 0) return null;
  const start = new Array<number>(PARAM_COUNT).fill(0);
  for (const prior of PRIORS) start[prior.index] = prior.mean(screen);
  const residuals = (theta: readonly number[]): number[] => [
    ...rowResiduals({ theta, sx, sy, forward }, rows),
    ...PRIORS.map((p) => (PRIOR_PX * ((theta[p.index] ?? 0) - p.mean(screen))) / p.sd),
  ];
  const theta = levenbergMarquardt(start, residuals);
  const params = { theta, sx, sy, forward };
  const fitted = rowResiduals(params, rows);
  const rmsPx = Math.sqrt(fitted.reduce((s, r) => s + r * r, 0) / rows.length);
  return Number.isFinite(rmsPx) ? { params, rmsPx } : null;
}

function rowResiduals(params: GeometricParams, rows: readonly FitRow[]): number[] {
  const out: number[] = [];
  for (const { inputs, target } of rows) {
    const p = projectGaze(params, inputs);
    if (p) out.push(p.x - target.x, p.y - target.y);
    else out.push(MISS_PX, MISS_PX);
  }
  return out;
}

const sumSquares = (r: readonly number[]): number => r.reduce((s, v) => s + v * v, 0);

/** Minimises the sum of squared residuals, with a forward-difference Jacobian. */
export function levenbergMarquardt(
  start: readonly number[],
  residuals: (theta: readonly number[]) => number[],
  maxIterations = 100,
): number[] {
  let theta = [...start];
  let r = residuals(theta);
  let cost = sumSquares(r);
  let mu = 1e-3;
  const n = theta.length;

  for (let iter = 0; iter < maxIterations; iter++) {
    const jac: number[][] = [];
    for (let j = 0; j < n; j++) {
      const h = 1e-6 * Math.max(1, Math.abs(theta[j] ?? 0));
      const bumped = [...theta];
      bumped[j] = (bumped[j] ?? 0) + h;
      const rb = residuals(bumped);
      jac.push(rb.map((v, i) => (v - (r[i] ?? 0)) / h));
    }
    const jtj = Array.from({ length: n }, (_, a) =>
      Array.from({ length: n }, (_, b) =>
        (jac[a] ?? []).reduce((s, v, i) => s + v * (jac[b]?.[i] ?? 0), 0),
      ),
    );
    const jtr = Array.from({ length: n }, (_, a) =>
      (jac[a] ?? []).reduce((s, v, i) => s + v * (r[i] ?? 0), 0),
    );

    let improved = false;
    for (let attempt = 0; attempt < 10 && !improved; attempt++) {
      const damped = jtj.map((row, a) =>
        row.map((v, b) => (a === b ? v + mu * Math.max(v, 1e-9) : v)),
      );
      const step = solve(
        damped,
        jtr.map((v) => -v),
      );
      if (!step) {
        mu *= 10;
        continue;
      }
      const next = theta.map((v, i) => v + (step[i] ?? 0));
      const rn = residuals(next);
      const cn = sumSquares(rn);
      if (cn < cost) {
        const gain = cost - cn;
        theta = next;
        r = rn;
        cost = cn;
        mu = Math.max(mu / 3, 1e-9);
        improved = true;
        if (gain < 1e-10 * (1 + cost)) return theta;
      } else {
        mu *= 4;
      }
    }
    if (!improved) break;
  }
  return theta;
}
