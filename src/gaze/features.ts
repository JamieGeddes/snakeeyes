import type { HeadPose, HeadTransform, IrisPosition } from '../tracking/features';
import type { TrackingSample } from '../tracking/protocol';

export interface GazeInputs {
  readonly iris: IrisPosition;
  readonly pose: HeadPose;
  readonly head: HeadTransform;
}

export interface GazeSample {
  /** Main-thread capture time in ms. */
  readonly t: number;
  /** Null when no face, or the face lacked iris or head data. */
  readonly inputs: GazeInputs | null;
  readonly blinking: boolean;
}

/** Blendshape score above which an eye counts as closed. */
export const BLINK_THRESHOLD = 0.5;

export function toGazeSample(s: TrackingSample): GazeSample {
  const face = s.face;
  const inputs =
    face?.iris && face.pose && face.head
      ? { iris: face.iris, pose: face.pose, head: face.head }
      : null;
  const blinking = face ? Math.max(face.blink.left, face.blink.right) > BLINK_THRESHOLD : false;
  return { t: s.t, inputs, blinking };
}

/**
 * Features for the gaze model: iris position (with centred quadratic terms for
 * the eye's curvature), eye openness (lids follow vertical gaze), and head angle.
 */
export function featureVector({ iris, pose }: Pick<GazeInputs, 'iris' | 'pose'>): number[] {
  const dx = iris.x - 0.5;
  const dy = iris.y - 0.5;
  return [dx, dy, iris.openness, dx * dx, dy * dy, dx * dy, pose.yaw, pose.pitch];
}

/** Minimum standardisation scale per feature, matching `featureVector`. */
export const FEATURE_FLOORS: readonly number[] = [
  0.002, 0.002, 0.005, 0.0005, 0.0005, 0.0005, 0.01, 0.01,
];
