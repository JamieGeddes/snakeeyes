import { CameraError } from './camera/camera';
import { CameraChoice, cameraNote } from './camera/cameraChoice';
import { Game, type GameEvent } from './game/game';
import { HighScore } from './game/highScore';
import { TARGET_ERROR_PX, type GazeModel } from './gaze/calibration';
import { toGazeSample } from './gaze/features';
import type { LostReason } from './gaze/presence';
import { GazeInput } from './input/gaze';
import { MouseInput } from './input/mouse';
import type { InputSource } from './input/types';
import { Renderer } from './render/renderer';
import { safeStorage } from './storage';
import type { TrackingSample } from './tracking/protocol';
import { TrackingSession } from './tracking/session';
import { CalibrationView, type CalibrationResult } from './ui/calibrationView';
import { CameraPicker } from './ui/cameraPicker';
import { Overlay, type Action } from './ui/overlay';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
/** Calibration still holds if the play area is within this many px of its size then. */
const SIZE_TOLERANCE_PX = 2;

const el = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing #${id}`);
  return e as T;
};

const canvas = el<HTMLCanvasElement>('game');
const video = el<HTMLVideoElement>('video');
const overlay = new Overlay(el('overlay'));

const debug = new URLSearchParams(window.location.search).has('debug');
const gaze = new GazeInput();
const input: InputSource = debug ? new MouseInput() : gaze;
const renderer = new Renderer(canvas);
const calibration = new CalibrationView(canvas);
const highScore = new HighScore(safeStorage());
const cameraChoice = new CameraChoice(safeStorage());
const game = new Game(boardSize());

const session = debug
  ? null
  : new TrackingSession({ video, onSample, onCameraLost: showCameraLost });

const cameraPicker = new CameraPicker({
  canRequestAccess: true,
  onChange: (id) => {
    cameraChoice.save(id);
    // Once tracking is running, a new camera needs a new calibration.
    if (session?.active) void startTracking();
    else cameraPicker.setNote(cameraNote(cameraPicker.list, id));
  },
  onRefresh: (cameras) =>
    cameraPicker.setNote(cameraNote(cameras, cameraChoice.saved, session?.cameraInUse ?? null)),
});

let calibrating = false;

function boardSize(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

async function enterFullscreen(): Promise<void> {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen().catch(() => undefined);
  }
  // Let the resize that follows fullscreen land before anything measures the window.
  await nextFrame();
  await nextFrame();
}

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

function onSample(sample: TrackingSample): void {
  if (calibration.running) calibration.handleSample(sample);
  else gaze.update(toGazeSample(sample));
}

// --- Screens -------------------------------------------------------------

function showReady(): void {
  overlay.show(
    debug
      ? {
          title: 'SnakeEyes',
          text: 'Debug mode: steer with the mouse. Eat fruit to grow; crossing yourself trims your tail. Two minutes on the clock.',
          actions: [{ label: 'Start', run: startDebugRound }],
          extra: cameraPicker.element,
        }
      : {
          title: 'SnakeEyes',
          text: 'Steer the snake with your eyes. Eat fruit to grow; crossing yourself trims your tail. Two minutes on the clock. Camera frames stay on this computer.',
          actions: [{ label: 'Start', run: () => void startTracking() }],
          extra: cameraPicker.element,
        },
  );
  void cameraPicker.refresh(cameraChoice.saved);
}

/** Menu buttons and camera picker for pause and game-over screens; gaze mode only. */
function gazeMenu(primary: Action): { actions: Action[]; extra?: HTMLElement } {
  if (debug) return { actions: [primary] };
  return {
    actions: [primary, { label: 'Recalibrate', run: () => void calibrate() }],
    extra: cameraPicker.element,
  };
}

const PAUSE_SCREENS: Record<'manual' | LostReason, { title: string; text: string }> = {
  manual: { title: 'Paused', text: 'Press Space or Resume to carry on.' },
  'no-face': {
    title: "Can't see you",
    text: 'Make sure your face is in view of the camera, then press Space or Resume.',
  },
  'eyes-closed': {
    title: 'Eyes closed',
    text: 'Paused while your eyes were shut. Press Space or Resume when ready.',
  },
};

function pause(reason: 'manual' | LostReason = 'manual'): void {
  if (game.phase !== 'playing' && game.phase !== 'countdown') return;
  game.pause();
  overlay.show({ ...PAUSE_SCREENS[reason], ...gazeMenu({ label: 'Resume', run: resume }) });
  void cameraPicker.refresh(cameraChoice.saved);
}

function showGameOver(score: number): void {
  const isBest = highScore.submit(score);
  overlay.show({
    title: "Time's up",
    text: isBest ? `New best: ${score}!` : `You scored ${score}. Best: ${highScore.best}.`,
    ...gazeMenu({ label: 'Play again', run: debug ? startDebugRound : () => void proceed() }),
  });
  if (!debug) void cameraPicker.refresh(cameraChoice.saved);
}

function showCameraLost(): void {
  game.pause();
  stopCalibration();
  overlay.show({
    title: 'Camera lost',
    text: 'Reconnect the camera and press Try again, or pick another camera.',
    actions: [{ label: 'Try again', run: () => void startTracking() }],
    extra: cameraPicker.element,
  });
  void cameraPicker.refresh(cameraChoice.saved);
}

function showCalibrationResult(result: CalibrationResult): void {
  if (!result.ok) {
    overlay.show({
      title: 'Calibration failed',
      text: result.reason,
      actions: [{ label: 'Try again', run: () => void calibrate() }],
      extra: cameraPicker.element,
    });
    return;
  }
  const { medianErrorPx, passed } = result.validation;
  const accuracy = `Accuracy ${Math.round(medianErrorPx)} px (target under ${TARGET_ERROR_PX} px).`;
  const play: Action = { label: passed ? 'Play' : 'Play anyway', run: () => carryOn(result.model) };
  const recalibrate: Action = { label: 'Recalibrate', run: () => void calibrate() };
  overlay.show({
    title: passed ? 'Calibrated' : 'Accuracy is low',
    text: passed
      ? `${accuracy} Look where you want the snake to go.`
      : `${accuracy} Recalibrating may help: keep your head still and check the lighting.`,
    actions: passed ? [play, recalibrate] : [recalibrate, play],
    extra: cameraPicker.element,
  });
}

// --- Flow ----------------------------------------------------------------

/** Opens the chosen camera, then calibrates. Also used to switch cameras. */
async function startTracking(): Promise<void> {
  if (!session) return;
  stopCalibration();
  game.pause();
  overlay.show({ title: 'Starting', text: 'Loading the face model and starting the camera…' });
  await enterFullscreen();
  try {
    await session.open(cameraChoice.saved);
  } catch (e) {
    overlay.show({
      title: 'Could not start',
      text: e instanceof CameraError ? e.message : `Tracking failed to start: ${String(e)}`,
      actions: [{ label: 'Try again', run: () => void startTracking() }],
      extra: cameraPicker.element,
    });
    void cameraPicker.refresh(cameraChoice.saved);
    return;
  }
  void cameraPicker.refresh(cameraChoice.saved);
  void calibrate();
}

async function calibrate(): Promise<void> {
  calibrating = true;
  overlay.hide();
  await enterFullscreen();
  const result = await calibration.run();
  calibrating = false;
  resize();
  showCalibrationResult(result);
}

function stopCalibration(): void {
  calibration.cancel();
  if (calibrating) resize();
  calibrating = false;
}

/** Resume or play again: recalibrates first if the play area changed size since calibration. */
async function proceed(): Promise<void> {
  overlay.hide();
  await enterFullscreen();
  const model = gaze.model;
  if (!model || !sameSize(model)) {
    void calibrate();
    return;
  }
  carryOn();
}

function sameSize(model: GazeModel): boolean {
  const { width, height } = boardSize();
  return (
    Math.abs(width - model.screen.width) <= SIZE_TOLERANCE_PX &&
    Math.abs(height - model.screen.height) <= SIZE_TOLERANCE_PX
  );
}

/** Starts a round, or resumes the paused one, optionally with a fresh calibration. */
function carryOn(model?: GazeModel): void {
  if (model) gaze.setModel(model);
  overlay.hide();
  if (game.phase === 'paused') game.resume();
  else game.start();
}

function resume(): void {
  if (debug) {
    void enterFullscreen();
    overlay.hide();
    game.resume();
  } else {
    void proceed();
  }
}

function startDebugRound(): void {
  void enterFullscreen();
  overlay.hide();
  game.start();
}

// --- Loop and events -----------------------------------------------------

function handle(events: readonly GameEvent[]): void {
  for (const e of events) if (e.type === 'over') showGameOver(e.score);
}

function resize(): void {
  const board = boardSize();
  renderer.resize(board.width, board.height);
  game.resize(board);
}

window.addEventListener('resize', () => {
  if (!calibrating) resize();
});

window.addEventListener('keydown', (e) => {
  if (calibrating) return;
  if (e.code === 'Escape') {
    pause();
    return;
  }
  if (e.code !== 'Space' || e.repeat) return;
  // Let a focused overlay control handle its own keys.
  const focused = document.activeElement;
  if (
    overlay.visible &&
    (focused instanceof HTMLButtonElement || focused instanceof HTMLSelectElement)
  )
    return;
  e.preventDefault();
  if (game.phase === 'playing' || game.phase === 'countdown') pause();
  else if (game.phase === 'paused') resume();
  else if (debug) startDebugRound();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('blur', () => pause());
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) pause();
});

let last = performance.now();
let accumulator = 0;

function frame(now: number): void {
  accumulator += Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;
  const active = game.phase === 'playing' || game.phase === 'countdown';
  if (!debug && active && !calibrating) {
    const lost = gaze.lost(now);
    if (lost) pause(lost);
  }
  const { target } = input.sample();
  while (accumulator >= STEP) {
    handle(game.step(STEP, target));
    accumulator -= STEP;
  }
  document.body.classList.toggle('playing', calibrating || active);
  if (!calibrating) renderer.draw(game, { target, best: highScore.best, time: now / 1000 });
  requestAnimationFrame(frame);
}

resize();
showReady();
requestAnimationFrame(frame);
