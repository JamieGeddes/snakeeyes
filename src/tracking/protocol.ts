import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Delegate } from './faceTracker';
import type { HeadPose, HeadTransform, IrisPosition } from './features';

export interface FaceData {
  readonly iris: IrisPosition | null;
  readonly pose: HeadPose | null;
  /** Head rotation and position in camera space (MediaPipe units, roughly cm). */
  readonly head: HeadTransform | null;
  readonly blink: { readonly left: number; readonly right: number };
  /** Only sent when requested, for debug drawing. */
  readonly landmarks?: NormalizedLandmark[];
}

export interface TrackingSample {
  /** Main-thread `performance.now()` when the frame was captured. */
  readonly t: number;
  /** Time the worker spent in face detection. */
  readonly inferenceMs: number;
  readonly face: FaceData | null;
}

export type ToWorker =
  | { readonly type: 'init'; readonly landmarks: boolean }
  | { readonly type: 'frame'; readonly bitmap: ImageBitmap; readonly t: number };

export type FromWorker =
  | { readonly type: 'ready'; readonly delegate: Delegate }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'sample'; readonly sample: TrackingSample };
