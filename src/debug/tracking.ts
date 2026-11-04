import { DrawingUtils, FaceLandmarker } from '@mediapipe/tasks-vision';
import { CameraError, openCamera, stopCamera } from '../camera/camera';
import { CameraChoice, cameraNote } from '../camera/cameraChoice';
import { safeStorage } from '../storage';
import { CameraPicker } from '../ui/cameraPicker';
import type { FaceData, TrackingSample } from '../tracking/protocol';
import { RateMeter, WindowStats } from '../tracking/stats';
import { TrackerClient } from '../tracking/trackerClient';

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
const cameraSlot = el<HTMLElement>('camera');

const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context unavailable');
const drawing = new DrawingUtils(ctx);

const detectRate = new RateMeter(1000);
const inferenceMs = new WindowStats(2000);
const facePresence = new WindowStats(5000);

type Measurement = { kind: 'jitter' | 'range'; until: number; x: WindowStats; y: WindowStats };
let measuring: Measurement | null = null;
const results: { jitter?: { x: number; y: number }; range?: { x: number; y: number } } = {};

const cameraChoice = new CameraChoice(safeStorage());
const picker = new CameraPicker({
  onChange: (id) => {
    cameraChoice.save(id);
    void start();
  },
  onRefresh: (cameras) => picker.setNote(cameraNote(cameras, cameraChoice.saved, cameraInUse)),
});
cameraSlot.append(picker.element);
picker.element.hidden = true;

let trackerReady: Promise<TrackerClient> | null = null;
let tracker: TrackerClient | null = null;
let stream: MediaStream | null = null;
let cameraInUse: string | null = null;
let lastFace: FaceData | null = null;
let lastStatsAt = 0;

startButton.addEventListener('click', () => {
  void start();
});
jitterButton.addEventListener('click', () => beginMeasurement('jitter', JITTER_MS));
rangeButton.addEventListener('click', () => beginMeasurement('range', RANGE_MS));

/** Starts tracking with the saved camera, or restarts it after a camera change. */
async function start(): Promise<void> {
  startButton.disabled = true;
  picker.disabled = true;
  measuring = null;
  closeCamera();
  status.textContent = 'Loading face model and starting camera…';
  try {
    trackerReady ??= TrackerClient.create({ landmarks: true });
    const [client, camera] = await Promise.all([
      trackerReady,
      openCamera(video, cameraChoice.saved),
    ]);
    tracker = client;
    stream = camera.stream;
    cameraInUse = camera.deviceId;
    camera.stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (stream !== camera.stream) return;
      closeCamera();
      status.textContent = 'The camera was disconnected. Pick a camera or press Start camera.';
      startButton.disabled = false;
      void picker.refresh();
    });
  } catch (e) {
    if (!tracker) trackerReady = null;
    status.textContent =
      e instanceof CameraError ? e.message : `Could not start tracking: ${String(e)}`;
    startButton.disabled = false;
    picker.disabled = false;
    await showPicker();
    return;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  // Measurements from another camera would mislead, so start the comparison afresh.
  delete results.jitter;
  delete results.range;
  renderQuality();
  status.textContent = 'Tracking.';
  jitterButton.disabled = false;
  rangeButton.disabled = false;
  picker.disabled = false;
  tracker.start(video, onSample);
  await showPicker();
}

async function showPicker(): Promise<void> {
  await picker.refresh(cameraChoice.saved);
  picker.element.hidden = false;
}

function closeCamera(): void {
  tracker?.stop();
  if (stream) stopCamera(stream);
  stream = null;
  cameraInUse = null;
  lastFace = null;
  jitterButton.disabled = true;
  rangeButton.disabled = true;
  draw(null);
}

function onSample(sample: TrackingSample): void {
  const t1 = performance.now();
  const face = sample.face;
  lastFace = face;

  detectRate.tick(t1);
  inferenceMs.add(t1, sample.inferenceMs);
  facePresence.add(t1, face ? 1 : 0);

  const iris = face?.iris;
  if (measuring && iris) {
    measuring.x.add(t1, iris.x);
    measuring.y.add(t1, iris.y);
  }
  if (measuring && t1 >= measuring.until) finishMeasurement();

  draw(face);
  if (t1 - lastStatsAt >= STATS_INTERVAL_MS) {
    lastStatsAt = t1;
    renderStats(t1);
  }
}

function draw(data: FaceData | null): void {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const face = data?.landmarks;
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
  const face = lastFace;
  const settings = stream?.getVideoTracks()[0]?.getSettings();
  const fps = detectRate.rate(now);
  const p95 = inferenceMs.percentile(0.95);
  const rows: Row[] = [
    ['Delegate', tracker?.delegate ?? '-'],
    ['Runs in', 'worker'],
    ['Camera', `${video.videoWidth}×${video.videoHeight} @ ${settings?.frameRate ?? '?'} fps`],
    ['Detection rate', `${fps.toFixed(0)} fps`, fps >= 25],
    ['Inference mean', `${inferenceMs.mean.toFixed(1)} ms`],
    ['Inference p95', `${p95.toFixed(1)} ms`, p95 <= 20],
    ['Face found (5 s)', `${(facePresence.mean * 100).toFixed(0)}%`, facePresence.mean >= 0.95],
  ];

  if (face) {
    const { iris, pose, position, blink } = face;
    rows.push(
      ['Iris x (image)', iris ? fixed(iris.x) : '-'],
      ['Iris y', iris ? fixed(iris.y) : '-'],
      ['Eye openness', iris ? fixed(iris.openness) : '-'],
      ['Blink L / R', `${fixed(blink.left, 2)} / ${fixed(blink.right, 2)}`],
      ['Head yaw', pose ? deg(pose.yaw) : '-'],
      ['Head pitch', pose ? deg(pose.pitch) : '-'],
      ['Head roll', pose ? deg(pose.roll) : '-'],
      ['Head position', position ? position.map((v) => v.toFixed(1)).join(', ') : '-'],
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
