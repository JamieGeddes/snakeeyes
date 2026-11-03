import { FaceLandmarker } from '@mediapipe/tasks-vision';
// The ES-module build of the runtime, which MediaPipe can load inside a module worker.
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url';

/** Served from public/models; no requests go to Google's CDN. */
const MODEL_URL = `${import.meta.env.BASE_URL}models/face_landmarker.task`;

export type Delegate = 'GPU' | 'CPU';

export interface FaceTracker {
  readonly landmarker: FaceLandmarker;
  readonly delegate: Delegate;
}

/**
 * Loads Face Landmarker for video, preferring the GPU and falling back to the CPU.
 * Must run in a module worker (see tracker.worker.ts).
 */
export async function createFaceTracker(): Promise<FaceTracker> {
  const fileset = { wasmLoaderPath, wasmBinaryPath };
  const create = (delegate: Delegate): Promise<FaceLandmarker> =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: new URL(MODEL_URL, self.location.href).href, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
  try {
    return { landmarker: await create('GPU'), delegate: 'GPU' };
  } catch {
    return { landmarker: await create('CPU'), delegate: 'CPU' };
  }
}
