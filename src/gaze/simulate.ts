import { mulberry32 } from '../game/random';
import type { Vec2 } from '../game/vec';
import { EYES, headPoseFromMatrix, irisPosition, type Landmark } from '../tracking/features';
import type { DotSequence, Screen } from './calibration';
import type { GazeInputs, GazeSample } from './features';

/**
 * Test helpers: a synthetic head and pair of eyes in 3D, seen by a pinhole camera.
 * Landmarks are projected and run through the real feature extraction, so effects
 * like the iris shifting against the eye corners when the head turns are present.
 *
 * Camera space follows MediaPipe: x right, y up, the camera looking down -z, with
 * the face's canonical forward axis +z. The screen lies in the z = 0 plane.
 */

export interface HeadState {
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
  /** Canonical face origin in camera space, cm. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const STILL_HEAD: HeadState = { yaw: 0, pitch: 0, roll: 0, x: 0, y: -6, z: -45 };

const PX_PER_CM = 38;
/** Camera sits this far above the screen's top edge, cm. */
const CAMERA_ABOVE_CM = 1;
const IMAGE = { width: 640, height: 480, focal: 520 };
/**
 * Eyeball centres' midpoint in the canonical face frame, slightly off the model's
 * assumed value so the test doesn't rely on it being exact.
 */
const EYE_MID: Vec3 = [0, 2.8, 2.4];
const EYE_HALF_SPAN = 3.15;
const EYEBALL_RADIUS = 1.2;
const CORNER_HALF_WIDTH = 1.4;
const CORNER_DEPTH = 0.5;
const LID_DEPTH = 0.9;

type Vec3 = readonly [number, number, number];
type Mat3 = readonly (readonly [number, number, number])[];

/** Screen px to a point on the z = 0 plane, cm. The player's right is camera -x. */
export function screenToCamera(p: Vec2, screen: Screen): Vec3 {
  return [-(p.x - screen.width / 2) / PX_PER_CM, -(p.y / PX_PER_CM + CAMERA_ABOVE_CM), 0];
}

const matMul = (a: Mat3, b: Mat3): Mat3 =>
  a.map((row) => [0, 1, 2].map((j) => row.reduce((s, v, k) => s + v * (b[k]?.[j] ?? 0), 0))) as [
    number,
    number,
    number,
  ][];
const apply = (m: Mat3, v: Vec3): Vec3 =>
  m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]) as unknown as Vec3;
const applyT = (m: Mat3, v: Vec3): Vec3 =>
  [0, 1, 2].map(
    (j) => (m[0]?.[j] ?? 0) * v[0] + (m[1]?.[j] ?? 0) * v[1] + (m[2]?.[j] ?? 0) * v[2],
  ) as unknown as Vec3;
const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const unit3 = (a: Vec3): Vec3 => scale3(a, 1 / Math.hypot(a[0], a[1], a[2]));

function rotation({ yaw, pitch, roll }: HeadState): Mat3 {
  const ry: Mat3 = [
    [Math.cos(yaw), 0, Math.sin(yaw)],
    [0, 1, 0],
    [-Math.sin(yaw), 0, Math.cos(yaw)],
  ];
  const rx: Mat3 = [
    [1, 0, 0],
    [0, Math.cos(pitch), -Math.sin(pitch)],
    [0, Math.sin(pitch), Math.cos(pitch)],
  ];
  const rz: Mat3 = [
    [Math.cos(roll), -Math.sin(roll), 0],
    [Math.sin(roll), Math.cos(roll), 0],
    [0, 0, 1],
  ];
  return matMul(matMul(ry, rx), rz);
}

function project(p: Vec3): Landmark {
  const depth = -p[2];
  return {
    x: (IMAGE.width / 2 + (IMAGE.focal * p[0]) / depth) / IMAGE.width,
    y: (IMAGE.height / 2 - (IMAGE.focal * p[1]) / depth) / IMAGE.height,
  };
}

/** Exact inputs for a head in `head` pose looking at `target` (screen px), plus noise. */
export function syntheticInputs(
  target: Vec2,
  screen: Screen,
  noise: number,
  rng: () => number,
  head: HeadState = STILL_HEAD,
  poseNoise = 0,
): GazeInputs {
  const r = rotation(head);
  const origin: Vec3 = [head.x, head.y, head.z];
  const lookAt = screenToCamera(target, screen);
  const landmarks: Landmark[] = new Array<Landmark>(478).fill({ x: 0, y: 0 });

  for (const [side, eye] of [
    [-1, EYES.right],
    [1, EYES.left],
  ] as const) {
    // The subject's right eye is on their right: -x in the face's frame.
    const centreLocal = add3(EYE_MID, [side * EYE_HALF_SPAN, 0, 0]);
    const centre = add3(origin, apply(r, centreLocal));
    const gazeLocal = applyT(r, unit3(sub3(lookAt, centre)));
    const local = (offset: Vec3): Landmark =>
      project(add3(origin, apply(r, add3(centreLocal, offset))));
    landmarks[eye.iris] = local(scale3(gazeLocal, EYEBALL_RADIUS));
    landmarks[eye.outer] = local([side * CORNER_HALF_WIDTH, 0, CORNER_DEPTH]);
    landmarks[eye.inner] = local([-side * CORNER_HALF_WIDTH, 0, CORNER_DEPTH]);
    // The upper lid follows vertical gaze more than the lower one.
    landmarks[eye.upper] = local([0, 0.5 + 0.35 * gazeLocal[1], LID_DEPTH]);
    landmarks[eye.lower] = local([0, -0.45 + 0.1 * gazeLocal[1], LID_DEPTH]);
  }

  const iris = irisPosition(landmarks, IMAGE.width / IMAGE.height);
  if (!iris) throw new Error('Synthetic eye produced no iris');
  const n = (k: number): number => (rng() - 0.5) * 2 * k;
  const noisyHead = poseNoise
    ? rotation({
        ...head,
        yaw: head.yaw + n(poseNoise),
        pitch: head.pitch + n(poseNoise),
        roll: head.roll + n(poseNoise),
      })
    : r;
  const position: Vec3 = [
    head.x + n(poseNoise * 20),
    head.y + n(poseNoise * 20),
    head.z + n(poseNoise * 40),
  ];
  const rotationRows = noisyHead.flatMap((row) => [...row]);
  // Column-major 4×4 for the pose decomposition used by the ridge model.
  const matrix = [0, 1, 2].flatMap((c) => [...[0, 1, 2].map((rr) => noisyHead[rr]?.[c] ?? 0), 0]);
  matrix.push(...position, 1);
  const pose = headPoseFromMatrix(matrix) ?? { yaw: 0, pitch: 0, roll: 0 };
  return {
    iris: { x: iris.x + n(noise), y: iris.y + n(noise), openness: iris.openness + n(noise) },
    pose,
    head: { rotation: rotationRows, position },
  };
}

export interface RunOptions {
  readonly noise?: number;
  readonly poseNoise?: number;
  readonly seed?: number;
  readonly skip?: (index: number) => boolean;
  /** Head pose over time (ms); defaults to still. */
  readonly head?: (t: number) => HeadState;
}

/** Runs a sequence at 30 fps with a synthetic eye looking at each dot. */
export function runSequence(seq: DotSequence, screen: Screen, options: RunOptions = {}): void {
  const rng = mulberry32(options.seed ?? 1);
  let t = 0;
  for (let guard = 0; !seq.done && guard < 100_000; guard++) {
    const dot = seq.current(t);
    if (!dot) break;
    const target = { x: dot.target.x * screen.width, y: dot.target.y * screen.height };
    const head = options.head?.(t) ?? STILL_HEAD;
    const sample: GazeSample = {
      t,
      inputs: options.skip?.(dot.index)
        ? null
        : syntheticInputs(target, screen, options.noise ?? 0.001, rng, head, options.poseNoise),
      blinking: false,
    };
    seq.update(t, sample);
    t += 1000 / 30;
  }
}

/**
 * Gentle head movement, as asked for in the head-move step: turning, nodding, then
 * leaning towards the screen and back, each for an equal share of the step.
 */
export function headSweep(
  durationMs: number,
  amplitude = 0.15,
  phases = 3,
): (t: number) => HeadState {
  return (t) => {
    const phase = (t % durationMs) / durationMs;
    const part = Math.min(phases - 1, Math.floor(phase * phases));
    const wave = Math.sin(phase * phases * Math.PI * 2);
    if (part === 0) return { ...STILL_HEAD, yaw: amplitude * wave };
    if (part === 1) return { ...STILL_HEAD, pitch: amplitude * 0.7 * wave };
    return { ...STILL_HEAD, z: STILL_HEAD.z + 40 * amplitude * wave };
  };
}

/** Natural fidgeting: slow turns, tilts and leans of a few degrees and cm. */
export function naturalHead(seed = 7, scale = 1): (t: number) => HeadState {
  const rng = mulberry32(seed);
  const phases = Array.from({ length: 6 }, () => rng() * Math.PI * 2);
  const w = (i: number, t: number, hz: number): number =>
    Math.sin((t / 1000) * hz * Math.PI * 2 + (phases[i] ?? 0));
  return (t) => ({
    yaw: scale * 0.12 * w(0, t, 0.11),
    pitch: scale * 0.08 * w(1, t, 0.07),
    roll: scale * 0.06 * w(2, t, 0.09),
    x: STILL_HEAD.x + scale * 4 * w(3, t, 0.05),
    y: STILL_HEAD.y + scale * 2.5 * w(4, t, 0.06),
    z: STILL_HEAD.z + scale * 5 * w(5, t, 0.04),
  });
}
