import { CameraError, startCamera } from '../camera/camera';
import { TARGET_ERROR_PX, type GazeModel } from '../gaze/calibration';
import { GazeEstimator, type GazeEstimate } from '../gaze/estimator';
import { toGazeSample } from '../gaze/features';
import { TrackerClient } from '../tracking/trackerClient';
import { RateMeter } from '../tracking/stats';
import type { TrackingSample } from '../tracking/protocol';
import { CalibrationView, type CalibrationResult } from '../ui/calibrationView';
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

let tracker: TrackerClient | null = null;
let estimator: GazeEstimator | null = null;
let estimate: GazeEstimate = { point: null, status: 'no-face' };
let liveFrame = 0;

function onSample(sample: TrackingSample): void {
  sampleRate.tick(performance.now());
  if (calibration.running) calibration.handleSample(sample);
  else if (estimator) estimate = estimator.update(toGazeSample(sample));
}

async function begin(): Promise<void> {
  document.documentElement.requestFullscreen().catch(() => undefined);
  overlay.show({ title: 'Starting', text: 'Loading the face model and starting the camera…' });
  try {
    const [client] = await Promise.all([TrackerClient.create(), startCamera(video)]);
    tracker = client;
    tracker.start(video, onSample);
  } catch (e) {
    overlay.show({
      title: 'Could not start',
      text: e instanceof CameraError ? e.message : `Tracking failed to start: ${String(e)}`,
      actions: [{ label: 'Try again', run: () => void begin() }],
    });
    return;
  }
  void calibrate();
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
  });
}

function startLive(model: GazeModel): void {
  overlay.hide();
  estimator = new GazeEstimator(model);
  estimate = { point: null, status: 'no-face' };
  document.body.classList.add('playing');
  liveFrame = requestAnimationFrame(drawLive);
}

function stopLive(): void {
  cancelAnimationFrame(liveFrame);
  estimator = null;
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
    `${estimate.status} · ${fps} fps · ${tracker?.delegate ?? ''} · R to recalibrate`,
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
  if (e.code === 'KeyR' && tracker && !calibration.running) void calibrate();
});

resize();
overlay.show({
  title: 'Gaze check',
  text: 'Calibrate, then see where the game thinks you are looking. Camera frames stay on this computer.',
  actions: [{ label: 'Start', run: () => void begin() }],
});
