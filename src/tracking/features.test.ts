import { describe, expect, it } from 'vitest';
import {
  blendshapeScore,
  eyeFeatures,
  headPoseFromMatrix,
  irisPosition,
  type Landmark,
} from './features';

const eye = { outer: 0, inner: 1, upper: 2, lower: 3, iris: 4 };

function eyeAt(iris: Landmark): Landmark[] {
  return [
    { x: 0.4, y: 0.5 }, // outer
    { x: 0.5, y: 0.5 }, // inner
    { x: 0.45, y: 0.48 }, // upper lid
    { x: 0.45, y: 0.52 }, // lower lid
    iris,
  ];
}

describe('eyeFeatures', () => {
  it('reports a centred iris as 0.5, 0.5', () => {
    const f = eyeFeatures(eyeAt({ x: 0.45, y: 0.5 }), eye, 1);
    expect(f?.horizontal).toBeCloseTo(0.5);
    expect(f?.vertical).toBeCloseTo(0.5);
    expect(f?.openness).toBeCloseTo(0.4);
  });

  it('tracks the iris moving towards a corner and a lid', () => {
    const f = eyeFeatures(eyeAt({ x: 0.475, y: 0.49 }), eye, 1);
    expect(f?.horizontal).toBeCloseTo(0.75);
    expect(f?.vertical).toBeCloseTo(0.25);
  });

  it('is unaffected by image aspect ratio for horizontal position', () => {
    const f = eyeFeatures(eyeAt({ x: 0.475, y: 0.5 }), eye, 16 / 9);
    expect(f?.horizontal).toBeCloseTo(0.75);
  });

  it('returns null when landmarks are missing or degenerate', () => {
    expect(eyeFeatures([], eye, 1)).toBeNull();
    const flat = eyeAt({ x: 0.45, y: 0.5 });
    flat[1] = flat[0] ?? { x: 0, y: 0 };
    expect(eyeFeatures(flat, eye, 1)).toBeNull();
  });
});

/** Column-major 4x4 from a 3x3 rotation (rows) plus translation. */
function transform(r: number[][], t = [0, 0, -50]): number[] {
  const at = (i: number, j: number): number => r[i]?.[j] ?? 0;
  // prettier-ignore
  return [
    at(0, 0), at(1, 0), at(2, 0), 0,
    at(0, 1), at(1, 1), at(2, 1), 0,
    at(0, 2), at(1, 2), at(2, 2), 0,
    t[0] ?? 0, t[1] ?? 0, t[2] ?? 0, 1,
  ];
}

const mul = (a: number[][], b: number[][]): number[][] =>
  a.map((row) => [0, 1, 2].map((j) => row.reduce((s, v, k) => s + v * (b[k]?.[j] ?? 0), 0)));

const ry = (a: number): number[][] => [
  [Math.cos(a), 0, Math.sin(a)],
  [0, 1, 0],
  [-Math.sin(a), 0, Math.cos(a)],
];
const rx = (a: number): number[][] => [
  [1, 0, 0],
  [0, Math.cos(a), -Math.sin(a)],
  [0, Math.sin(a), Math.cos(a)],
];
const rz = (a: number): number[][] => [
  [Math.cos(a), -Math.sin(a), 0],
  [Math.sin(a), Math.cos(a), 0],
  [0, 0, 1],
];

describe('headPoseFromMatrix', () => {
  it('recovers yaw, pitch and roll', () => {
    const pose = headPoseFromMatrix(transform(mul(mul(ry(0.3), rx(-0.2)), rz(0.1))));
    expect(pose?.yaw).toBeCloseTo(0.3);
    expect(pose?.pitch).toBeCloseTo(-0.2);
    expect(pose?.roll).toBeCloseTo(0.1);
  });

  it('tolerates uniform scale', () => {
    const scaled = mul(mul(ry(-0.4), rx(0.25)), rz(-0.15)).map((row) => row.map((v) => v * 1.7));
    const pose = headPoseFromMatrix(transform(scaled));
    expect(pose?.yaw).toBeCloseTo(-0.4);
    expect(pose?.pitch).toBeCloseTo(0.25);
    expect(pose?.roll).toBeCloseTo(-0.15);
  });

  it('returns null for a short matrix', () => {
    expect(headPoseFromMatrix([1, 0, 0])).toBeNull();
  });
});

describe('blendshapeScore', () => {
  it('finds a named score, defaulting to 0', () => {
    const cats = [{ categoryName: 'eyeBlinkLeft', score: 0.8 }];
    expect(blendshapeScore(cats, 'eyeBlinkLeft')).toBe(0.8);
    expect(blendshapeScore(cats, 'eyeBlinkRight')).toBe(0);
  });
});

describe('irisPosition', () => {
  /** Builds a 478-landmark face with both irises shifted by `dx` in image space. */
  function face(dx: number): Landmark[] {
    const lm: Landmark[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
    const put = (i: number, x: number, y: number): void => void (lm[i] = { x, y });
    // Subject's right eye, on the image left: outer 33 left of inner 133.
    put(33, 0.3, 0.5);
    put(133, 0.4, 0.5);
    put(159, 0.35, 0.48);
    put(145, 0.35, 0.52);
    put(468, 0.35 + dx, 0.5);
    // Subject's left eye, on the image right: inner 362 left of outer 263.
    put(362, 0.6, 0.5);
    put(263, 0.7, 0.5);
    put(386, 0.65, 0.48);
    put(374, 0.65, 0.52);
    put(473, 0.65 + dx, 0.5);
    return lm;
  }

  it('moves in the same direction for both eyes', () => {
    expect(irisPosition(face(0), 1)?.x).toBeCloseTo(0.5);
    expect(irisPosition(face(0.025), 1)?.x).toBeCloseTo(0.75);
    expect(irisPosition(face(-0.025), 1)?.x).toBeCloseTo(0.25);
  });

  it('returns null without a full face', () => {
    expect(irisPosition([], 1)).toBeNull();
  });
});
