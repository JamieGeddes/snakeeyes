import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { createFaceTracker, type FaceTracker } from './faceTracker';
import { blendshapeScore, headPoseFromMatrix, irisPosition } from './features';
import type { FaceData, FromWorker, ToWorker } from './protocol';

let tracker: FaceTracker | null = null;
let sendLandmarks = false;

const post = (message: FromWorker): void => self.postMessage(message);

self.addEventListener('message', (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  if (msg.type === 'init') {
    sendLandmarks = msg.landmarks;
    createFaceTracker()
      .then((t) => {
        tracker = t;
        post({ type: 'ready', delegate: t.delegate });
      })
      .catch((e: unknown) => post({ type: 'error', message: String(e) }));
    return;
  }

  const { bitmap, t } = msg;
  if (!tracker) {
    bitmap.close();
    return;
  }
  const start = performance.now();
  const result = tracker.landmarker.detectForVideo(bitmap, t);
  const inferenceMs = performance.now() - start;
  const face = toFaceData(result, bitmap.width / bitmap.height);
  bitmap.close();
  post({ type: 'sample', sample: { t, inferenceMs, face } });
});

function toFaceData(result: FaceLandmarkerResult, aspect: number): FaceData | null {
  const landmarks = result.faceLandmarks[0];
  if (!landmarks) return null;
  const blend = result.faceBlendshapes[0]?.categories ?? [];
  const matrix = result.facialTransformationMatrixes[0]?.data ?? [];
  const data: FaceData = {
    iris: irisPosition(landmarks, aspect),
    pose: headPoseFromMatrix(matrix),
    position: matrix.length >= 16 ? [matrix[12] ?? 0, matrix[13] ?? 0, matrix[14] ?? 0] : null,
    blink: {
      left: blendshapeScore(blend, 'eyeBlinkLeft'),
      right: blendshapeScore(blend, 'eyeBlinkRight'),
    },
  };
  return sendLandmarks ? { ...data, landmarks } : data;
}
