import { CameraError, openCamera, stopCamera } from '../camera/camera';
import { CameraChoice, cameraNote } from '../camera/cameraChoice';
import { TARGET_ERROR_PX, type GazeModel } from '../gaze/calibration';
import { GazeEstimator, type GazeEstimate } from '../gaze/estimator';
import { toGazeSample } from '../gaze/features';
import { TrackerClient } from '../tracking/trackerClient';
import { RateMeter } from '../tracking/stats';
import type { TrackingSample } from '../tracking/protocol';
import { safeStorage } from '../storage';
import { CalibrationView, type CalibrationResult } from '../ui/calibrationView';
import { CameraPicker } from '../ui/cameraPicker';
import { Overlay } from '../ui/overlay';

const el = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing #${id}`);
  return e as T;
};

const canvas = el<HTMLCanvasElement>('game');
const video = el<HTMLVideoElement>('video');
const overlayRoot = el<HTMLElement>('overlay');
const context = canvas.getContext('2d');
if (!context) throw new Error('Canvas 2D context unavailable');
const ctx = context;

const overlay = new Overlay(overlayRoot);
const calibration = new CalibrationView(canvas);
const sampleRate = new RateMeter(1000);

const cameraChoice = new CameraChoice(safeStorage());
const picker = new CameraPicker({
  onChange: (id) => {
    cameraChoice.save(id);
    void begin();
  },
  onRefresh: (cameras) => picker.setNote(cameraNote(cameras, cameraChoice.saved, cameraInUse)),
});

let trackerReady: Promise<TrackerClient> | null = null;
let tracker: TrackerClient | null = null;
let stream: MediaStream | null = null;
let cameraInUse: string | null = null;
let model: GazeModel | null = null;
let estimator: GazeEstimator | null = null;
let estimate: GazeEstimate = { point: null, status: 'no-face' };
let liveFrame = 0;

function onSample(sample: TrackingSample): void {
  sampleRate.tick(performance.now());
  if (calibration.running) calibration.handleSample(sample);
  else if (estimator) estimate = estimator.update(toGazeSample(sample));
}

/** Starts tracking with the saved camera, or restarts it after a camera change. */
async function begin(): Promise<void> {
  document.documentElement.requestFullscreen().catch(() => undefined);
  stopLive();
  calibration.cancel();
  document.body.classList.remove('playing');
  closeCamera();
  overlay.show({ title: 'Starting', text: 'Loading the face model and starting the camera…' });
  try {
    trackerReady ??= TrackerClient.create();
    const [client, camera] = await Promise.all([
      trackerReady,
      openCamera(video, cameraChoice.saved),
    ]);
    tracker = client;
    stream = camera.stream;
    cameraInUse = camera.deviceId;
    camera.stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (stream === camera.stream) onCameraLost();
    });
    tracker.start(video, onSample);
  } catch (e) {
    if (!tracker) trackerReady = null;
    void picker.refresh(cameraChoice.saved);
    overlay.show({
      title: 'Could not start',
      text: e instanceof CameraError ? e.message : `Tracking failed to start: ${String(e)}`,
      actions: [{ label: 'Try again', run: () => void begin() }],
      extra: picker.element,
    });
    return;
  }
  await picker.refresh(cameraChoice.saved);
  void calibrate();
}

function closeCamera(): void {
  tracker?.stop();
  if (stream) stopCamera(stream);
  stream = null;
  cameraInUse = null;
}

function onCameraLost(): void {
  closeCamera();
  stopLive();
  calibration.cancel();
  document.body.classList.remove('playing');
  void picker.refresh().then(() => picker.setNote('The camera was disconnected. Choose another.'));
  overlay.show({
    title: 'Camera lost',
    text: 'Reconnect the camera and try again, or pick another one.',
    actions: [{ label: 'Try again', run: () => void begin() }],
    extra: picker.element,
  });
}

/** Camera menu over the live view (C key). */
function showCameraMenu(): void {
  const current = model;
  if (!current) return;
  document.body.classList.remove('playing');
  overlay.show({
    title: 'Camera',
    text: 'Changing camera starts calibration again.',
    actions: [
      { label: 'Back', run: () => startLive(current) },
      { label: 'Recalibrate', run: () => void calibrate() },
    ],
    extra: picker.element,
  });
}

async function calibrate(): Promise<void> {
  stopLive();
  overlay.hide();
  document.body.classList.add('playing');
  const result = await calibration.run();
  document.body.classList.remove('playing');
  showResult(result);
}

function showResult(result: CalibrationResult): void {
  if (!result.ok) {
    overlay.show({
      title: 'Calibration failed',
      text: result.reason,
      actions: [{ label: 'Try again', run: () => void calibrate() }],
      extra: picker.element,
    });
    return;
  }
  const { medianErrorPx, perDotPx, passed } = result.validation;
  const dots = perDotPx.map((e) => (e === null ? '-' : `${Math.round(e)}`)).join(', ');
  overlay.show({
    title: passed ? 'Calibrated' : 'Accuracy is low',
    text:
      `Median error ${Math.round(medianErrorPx)} px (target ${TARGET_ERROR_PX} px). ` +
      `Per dot: ${dots} px. Fit error ${Math.round(result.model.cvErrorPx)} px.` +
      (passed ? '' : ' Recalibrating may help: keep your head still and check the lighting.'),
    actions: passed
      ? [
          { label: 'Continue', run: () => startLive(result.model) },
          { label: 'Recalibrate', run: () => void calibrate() },
        ]
      : [
          { label: 'Recalibrate', run: () => void calibrate() },
          { label: 'Continue anyway', run: () => startLive(result.model) },
        ],
    extra: picker.element,
  });
}

function startLive(next: GazeModel): void {
  overlay.hide();
  cancelAnimationFrame(liveFrame);
  if (model !== next) estimator = new GazeEstimator(next);
  model = next;
  estimate = { point: null, status: 'no-face' };
  document.body.classList.add('playing');
  liveFrame = requestAnimationFrame(drawLive);
}

function stopLive(): void {
  cancelAnimationFrame(liveFrame);
  estimator = null;
  model = null;
}

function drawLive(now: number): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.fillStyle = '#0a101b';
  ctx.fillRect(0, 0, w, h);

  // Reference crosses to look at.
  ctx.strokeStyle = 'rgba(159, 176, 200, 0.35)';
  ctx.lineWidth = 1;
  for (const fy of [0.1, 0.5, 0.9]) {
    for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const x = fx * w;
      const y = fy * h;
      ctx.beginPath();
      ctx.moveTo(x - 10, y);
      ctx.lineTo(x + 10, y);
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x, y + 10);
      ctx.stroke();
    }
  }

  const p = estimate.point;
  if (p) {
    ctx.strokeStyle =
      estimate.status === 'blink' ? 'rgba(255, 179, 107, 0.6)' : 'rgba(126, 240, 192, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(126, 240, 192, 0.7)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#9fb0c8';
  ctx.font = '15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const fps = sampleRate.rate(now).toFixed(0);
  ctx.fillText(
    `${estimate.status} · ${fps} fps · ${tracker?.delegate ?? ''} · R to recalibrate · C for camera`,
    16,
    16,
  );
  liveFrame = requestAnimationFrame(drawLive);
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement || !tracker || calibration.running) return;
  if (e.code === 'KeyR' && stream) void calibrate();
  else if (e.code === 'KeyC' && model && !overlay.visible) showCameraMenu();
});

resize();
overlay.show({
  title: 'Gaze check',
  text: 'Calibrate, then see where the game thinks you are looking. Camera frames stay on this computer.',
  actions: [{ label: 'Start', run: () => void begin() }],
});
