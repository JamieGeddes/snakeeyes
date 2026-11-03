import { DrawingUtils, FaceLandmarker, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { CameraError, startCamera } from '../camera/camera';
import { createFaceTracker, type FaceTracker } from '../tracking/faceTracker';
import { blendshapeScore, headPoseFromMatrix, irisPosition } from '../tracking/features';
import { RateMeter, WindowStats } from '../tracking/stats';

const JITTER_MS = 3000;
const RANGE_MS = 6000;
const STATS_INTERVAL_MS = 200;
const TARGET_RATIO_X = 10;
const TARGET_RATIO_Y = 6;

const el = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing #${id}`);
  return e as T;
};

const video = el<HTMLVideoElement>('video');
const canvas = el<HTMLCanvasElement>('overlay');
const startButton = el<HTMLButtonElement>('start');
const jitterButton = el<HTMLButtonElement>('measure-jitter');
const rangeButton = el<HTMLButtonElement>('measure-range');
const status = el<HTMLElement>('status');
const statsList = el<HTMLElement>('stats');
const qualityList = el<HTMLElement>('quality');

const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context unavailable');
const drawing = new DrawingUtils(ctx);

const detectRate = new RateMeter(1000);
const inferenceMs = new WindowStats(2000);
const facePresence = new WindowStats(5000);

type Measurement = { kind: 'jitter' | 'range'; until: number; x: WindowStats; y: WindowStats };
let measuring: Measurement | null = null;
const results: { jitter?: { x: number; y: number }; range?: { x: number; y: number } } = {};

let tracker: FaceTracker | null = null;
let stream: MediaStream | null = null;
let lastResult: FaceLandmarkerResult | null = null;
let lastStatsAt = 0;

startButton.addEventListener('click', () => {
  void start();
});
jitterButton.addEventListener('click', () => beginMeasurement('jitter', JITTER_MS));
rangeButton.addEventListener('click', () => beginMeasurement('range', RANGE_MS));

async function start(): Promise<void> {
  startButton.disabled = true;
  status.textContent = 'Loading face model and starting camera…';
  try {
    [tracker, stream] = await Promise.all([createFaceTracker(), startCamera(video)]);
  } catch (e) {
    status.textContent =
      e instanceof CameraError ? e.message : `Could not start tracking: ${String(e)}`;
    startButton.disabled = false;
    return;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  status.textContent = 'Tracking.';
  jitterButton.disabled = false;
  rangeButton.disabled = false;
  video.requestVideoFrameCallback(onFrame);
}

function onFrame(): void {
  if (!tracker) return;
  const t0 = performance.now();
  const result = tracker.landmarker.detectForVideo(video, t0);
  const t1 = performance.now();
  lastResult = result;

  detectRate.tick(t1);
  inferenceMs.add(t1, t1 - t0);
  const face = result.faceLandmarks[0];
  facePresence.add(t1, face ? 1 : 0);

  const iris = face ? irisPosition(face, video.videoWidth / video.videoHeight) : null;
  if (measuring && iris) {
    measuring.x.add(t1, iris.x);
    measuring.y.add(t1, iris.y);
  }
  if (measuring && t1 >= measuring.until) finishMeasurement();

  draw(result);
  if (t1 - lastStatsAt >= STATS_INTERVAL_MS) {
    lastStatsAt = t1;
    renderStats(t1);
  }
  video.requestVideoFrameCallback(onFrame);
}

function draw(result: FaceLandmarkerResult): void {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const face = result.faceLandmarks[0];
  if (!face) return;
  const eyeStyle = { color: 'rgba(126, 240, 192, 0.8)', lineWidth: 1 };
  const irisStyle = { color: '#ffb36b', lineWidth: 1.5 };
  drawing.drawConnectors(face, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, eyeStyle);
  drawing.drawConnectors(face, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, eyeStyle);
  drawing.drawConnectors(face, FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS, irisStyle);
  drawing.drawConnectors(face, FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, irisStyle);
}

function beginMeasurement(kind: Measurement['kind'], ms: number): void {
  const window = ms + 1000;
  measuring = {
    kind,
    until: performance.now() + ms,
    x: new WindowStats(window),
    y: new WindowStats(window),
  };
  jitterButton.disabled = true;
  rangeButton.disabled = true;
  status.textContent =
    kind === 'jitter' ? 'Hold still and stare at one spot…' : 'Look edge to edge…';
}

function finishMeasurement(): void {
  if (!measuring) return;
  const { kind, x, y } = measuring;
  if (x.count < 10) {
    status.textContent = 'Not enough frames with a face; try again.';
  } else if (kind === 'jitter') {
    results.jitter = { x: x.std, y: y.std };
    status.textContent = 'Jitter measured.';
  } else {
    // 5th to 95th percentile spread, so a stray frame doesn't inflate the range.
    results.range = {
      x: x.percentile(0.95) - x.percentile(0.05),
      y: y.percentile(0.95) - y.percentile(0.05),
    };
    status.textContent = 'Range measured.';
  }
  measuring = null;
  jitterButton.disabled = false;
  rangeButton.disabled = false;
  renderQuality();
}

type Row = readonly [label: string, value: string, verdict?: boolean];

function renderList(list: HTMLElement, rows: readonly Row[]): void {
  list.replaceChildren(
    ...rows.flatMap(([label, value, verdict]) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      if (verdict !== undefined) dd.className = verdict ? 'pass' : 'fail';
      return [dt, dd];
    }),
  );
}

const fixed = (v: number, digits = 3): string => v.toFixed(digits);
const deg = (r: number): string => `${((r * 180) / Math.PI).toFixed(1)}°`;

function renderStats(now: number): void {
  const result = lastResult;
  const face = result?.faceLandmarks[0];
  const settings = stream?.getVideoTracks()[0]?.getSettings();
  const fps = detectRate.rate(now);
  const p95 = inferenceMs.percentile(0.95);
  const rows: Row[] = [
    ['Delegate', tracker?.delegate ?? '-'],
    ['Camera', `${video.videoWidth}×${video.videoHeight} @ ${settings?.frameRate ?? '?'} fps`],
    ['Detection rate', `${fps.toFixed(0)} fps`, fps >= 25],
    ['Inference mean', `${inferenceMs.mean.toFixed(1)} ms`],
    ['Inference p95', `${p95.toFixed(1)} ms`, p95 <= 20],
    ['Face found (5 s)', `${(facePresence.mean * 100).toFixed(0)}%`, facePresence.mean >= 0.95],
  ];

  if (face && result) {
    const iris = irisPosition(face, video.videoWidth / video.videoHeight);
    const blend = result.faceBlendshapes[0]?.categories ?? [];
    const matrix = result.facialTransformationMatrixes[0]?.data ?? [];
    const pose = headPoseFromMatrix(matrix);
    const translation = [matrix[12], matrix[13], matrix[14]].map((v) => (v ?? 0).toFixed(1));
    // In column-major layout the bottom row (3, 7, 11) is zero and translation sits in 12 to 14.
    const columnMajor =
      matrix.length >= 16 &&
      Math.abs(matrix[14] ?? 0) > 1 &&
      [3, 7, 11].every((i) => Math.abs(matrix[i] ?? 0) < 1e-3);
    rows.push(
      ['Iris x (image)', iris ? fixed(iris.x) : '-'],
      ['Iris y', iris ? fixed(iris.y) : '-'],
      ['Eye openness', iris ? fixed(iris.openness) : '-'],
      [
        'Blink L / R',
        `${fixed(blendshapeScore(blend, 'eyeBlinkLeft'), 2)} / ${fixed(blendshapeScore(blend, 'eyeBlinkRight'), 2)}`,
      ],
      ['Head yaw', pose ? deg(pose.yaw) : '-'],
      ['Head pitch', pose ? deg(pose.pitch) : '-'],
      ['Head roll', pose ? deg(pose.roll) : '-'],
      ['Head position', translation.join(', ')],
      ['Matrix layout', columnMajor ? 'column-major' : 'unexpected', columnMajor],
    );
  } else {
    rows.push(['Face', 'not found', false]);
  }
  renderList(statsList, rows);
}

function renderQuality(): void {
  const { jitter, range } = results;
  const rows: Row[] = [
    ['Jitter x / y', jitter ? `${fixed(jitter.x, 4)} / ${fixed(jitter.y, 4)}` : 'not measured'],
    ['Range x / y', range ? `${fixed(range.x)} / ${fixed(range.y)}` : 'not measured'],
  ];
  if (jitter && range) {
    const rx = range.x / Math.max(jitter.x, 1e-6);
    const ry = range.y / Math.max(jitter.y, 1e-6);
    rows.push(
      [`Ratio x (target ${TARGET_RATIO_X})`, rx.toFixed(1), rx >= TARGET_RATIO_X],
      [`Ratio y (target ${TARGET_RATIO_Y})`, ry.toFixed(1), ry >= TARGET_RATIO_Y],
    );
  }
  renderList(qualityList, rows);
}

renderQuality();
