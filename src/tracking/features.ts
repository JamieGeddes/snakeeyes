/** A landmark in normalised image coordinates (0 to 1 across width and height). */
export interface Landmark {
  readonly x: number;
  readonly y: number;
}

export interface EyeIndices {
  readonly outer: number;
  readonly inner: number;
  readonly upper: number;
  readonly lower: number;
  readonly iris: number;
}

/** MediaPipe Face Mesh indices; "left" and "right" are the subject's own eyes. */
export const EYES = {
  right: { outer: 33, inner: 133, upper: 159, lower: 145, iris: 468 },
  left: { outer: 263, inner: 362, upper: 386, lower: 374, iris: 473 },
} as const satisfies Record<string, EyeIndices>;

export interface EyeFeatures {
  /** Iris position along the eye: 0 at the outer corner, 1 at the inner corner. */
  readonly horizontal: number;
  /** Iris position between the lids: 0 at the upper lid, 1 at the lower lid. */
  readonly vertical: number;
  /** Lid gap divided by eye width; drops towards 0 in a blink. */
  readonly openness: number;
}

/**
 * Locates the iris within the eye. `aspect` is image width / height, used so
 * normalised coordinates are compared on equal scales.
 */
export function eyeFeatures(
  landmarks: readonly Landmark[],
  eye: EyeIndices,
  aspect: number,
): EyeFeatures | null {
  const p = (i: number): Landmark | null => {
    const l = landmarks[i];
    return l ? { x: l.x * aspect, y: l.y } : null;
  };
  const outer = p(eye.outer);
  const inner = p(eye.inner);
  const upper = p(eye.upper);
  const lower = p(eye.lower);
  const iris = p(eye.iris);
  if (!outer || !inner || !upper || !lower || !iris) return null;

  const ax = inner.x - outer.x;
  const ay = inner.y - outer.y;
  const width2 = ax * ax + ay * ay;
  const vx = lower.x - upper.x;
  const vy = lower.y - upper.y;
  const gap2 = vx * vx + vy * vy;
  if (width2 < 1e-10) return null;

  return {
    horizontal: ((iris.x - outer.x) * ax + (iris.y - outer.y) * ay) / width2,
    vertical: gap2 < 1e-10 ? 0.5 : ((iris.x - upper.x) * vx + (iris.y - upper.y) * vy) / gap2,
    openness: Math.sqrt(gap2 / width2),
  };
}

export interface HeadPose {
  /** Turning left or right, in radians. */
  readonly yaw: number;
  /** Nodding up or down, in radians. */
  readonly pitch: number;
  /** Tilting towards a shoulder, in radians. */
  readonly roll: number;
}

/**
 * Extracts yaw, pitch and roll from a column-major 4x4 transform, assuming
 * rotation order R = Ry(yaw) * Rx(pitch) * Rz(roll). Uniform scale is tolerated.
 */
export function headPoseFromMatrix(data: readonly number[]): HeadPose | null {
  if (data.length < 16) return null;
  const at = (row: number, col: number): number => data[col * 4 + row] ?? 0;
  return {
    yaw: Math.atan2(at(0, 2), at(2, 2)),
    pitch: Math.atan2(-at(1, 2), Math.hypot(at(1, 0), at(1, 1))),
    roll: Math.atan2(at(1, 0), at(1, 1)),
  };
}

export type Vec3 = readonly [number, number, number];

/** Head rotation and position in camera space, from MediaPipe's facial transform. */
export interface HeadTransform {
  /** 3×3 rotation, row-major, with any scale removed. */
  readonly rotation: readonly number[];
  /** Translation of the canonical face origin, in MediaPipe units (roughly cm). */
  readonly position: Vec3;
}

/** Splits a column-major 4×4 transform into rotation (scale removed) and position. */
export function headTransformFromMatrix(data: readonly number[]): HeadTransform | null {
  if (data.length < 16) return null;
  const at = (row: number, col: number): number => data[col * 4 + row] ?? 0;
  const scales = [0, 1, 2].map((c) => Math.hypot(at(0, c), at(1, c), at(2, c)));
  if (scales.some((s) => s < 1e-9)) return null;
  const rotation = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => at(r, c) / (scales[c] ?? 1)));
  return { rotation, position: [at(0, 3), at(1, 3), at(2, 3)] };
}

export interface Category {
  readonly categoryName: string;
  readonly score: number;
}

/** Score of a named blendshape (e.g. "eyeBlinkLeft"), or 0 if absent. */
export function blendshapeScore(categories: readonly Category[], name: string): number {
  return categories.find((c) => c.categoryName === name)?.score ?? 0;
}

export interface IrisPosition {
  /** Mean iris position across both eyes, 0 at image left to 1 at image right. */
  readonly x: number;
  /** Mean iris position between the lids, 0 at upper to 1 at lower. */
  readonly y: number;
  /** Mean openness of both eyes. */
  readonly openness: number;
}

/**
 * Combines both eyes into one iris position in image orientation. The subject's
 * right eye has its outer corner on the image left; the left eye is the reverse,
 * so its horizontal value is flipped before averaging.
 */
export function irisPosition(landmarks: readonly Landmark[], aspect: number): IrisPosition | null {
  const right = eyeFeatures(landmarks, EYES.right, aspect);
  const left = eyeFeatures(landmarks, EYES.left, aspect);
  if (!right || !left) return null;
  return {
    x: (right.horizontal + (1 - left.horizontal)) / 2,
    y: (right.vertical + left.vertical) / 2,
    openness: (right.openness + left.openness) / 2,
  };
}
