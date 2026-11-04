import {
  CALIBRATION_POINTS,
  CALIBRATION_TIMING,
  DotSequence,
  evaluateValidation,
  fitCalibration,
  toPixels,
  VALIDATION_POINTS,
  VALIDATION_TIMING,
  type GazeModel,
  type ValidationResult,
} from '../gaze/calibration';
import { toGazeSample } from '../gaze/features';
import type { TrackingSample } from '../tracking/protocol';

export type CalibrationResult =
  | { readonly ok: true; readonly model: GazeModel; readonly validation: ValidationResult }
  | { readonly ok: false; readonly reason: string };

const INTRO_MS = 2500;
const FONT = 'system-ui, sans-serif';

type Stage =
  | { kind: 'intro'; until: number }
  | { kind: 'calibrate'; seq: DotSequence }
  | { kind: 'validate'; seq: DotSequence; model: GazeModel };

/**
 * Fullscreen, hands-free calibration: 9 dots to fit the model, then 4 dots to
 * measure accuracy. Feed it tracking samples via `handleSample` while it runs.
 */
export class CalibrationView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private stage: Stage | null = null;
  private finish: ((r: CalibrationResult) => void) | null = null;
  private frame = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.canvas = canvas;
    this.ctx = ctx;
  }

  get running(): boolean {
    return this.stage !== null;
  }

  run(): Promise<CalibrationResult> {
    this.cancel();
    this.resize();
    this.stage = { kind: 'intro', until: performance.now() + INTRO_MS };
    this.frame = requestAnimationFrame(this.tick);
    return new Promise((resolve) => {
      this.finish = resolve;
    });
  }

  cancel(): void {
    cancelAnimationFrame(this.frame);
    this.stage = null;
    this.finish = null;
  }

  handleSample(sample: TrackingSample): void {
    const stage = this.stage;
    if (stage && stage.kind !== 'intro') stage.seq.update(sample.t, toGazeSample(sample));
  }

  private get screen(): { width: number; height: number } {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = this.screen;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private readonly tick = (now: number): void => {
    const stage = this.stage;
    if (!stage) return;
    this.advance(stage, now);
    if (this.stage) {
      this.draw(this.stage, now);
      this.frame = requestAnimationFrame(this.tick);
    }
  };

  private advance(stage: Stage, now: number): void {
    if (stage.kind === 'intro') {
      if (now >= stage.until) {
        this.stage = {
          kind: 'calibrate',
          seq: new DotSequence(CALIBRATION_POINTS, CALIBRATION_TIMING),
        };
      }
      return;
    }
    stage.seq.update(now);
    if (!stage.seq.done) return;

    if (stage.kind === 'calibrate') {
      const model = fitCalibration(stage.seq, this.screen);
      if (!model) {
        this.end({
          ok: false,
          reason:
            "Your eyes weren't visible clearly enough. Check your face is well lit and in view of the camera, then try again.",
        });
        return;
      }
      this.stage = {
        kind: 'validate',
        seq: new DotSequence(VALIDATION_POINTS, VALIDATION_TIMING),
        model,
      };
      return;
    }
    this.end({
      ok: true,
      model: stage.model,
      validation: evaluateValidation(stage.model, stage.seq),
    });
  }

  private end(result: CalibrationResult): void {
    const finish = this.finish;
    this.cancel();
    this.clear();
    finish?.(result);
  }

  private clear(): void {
    const { width, height } = this.screen;
    this.ctx.fillStyle = '#0a101b';
    this.ctx.fillRect(0, 0, width, height);
  }

  private draw(stage: Stage, now: number): void {
    const { ctx } = this;
    const { width, height } = this.screen;
    this.clear();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (stage.kind === 'intro') {
      ctx.fillStyle = '#e6edf7';
      ctx.font = `600 28px ${FONT}`;
      ctx.fillText('Keep your head still and follow the dot with your eyes', width / 2, height / 2);
      ctx.fillStyle = '#9fb0c8';
      ctx.font = `18px ${FONT}`;
      ctx.fillText('It moves on by itself. Blinking is fine.', width / 2, height / 2 + 40);
      return;
    }

    const dot = stage.seq.current(now);
    if (!dot) return;
    const p = toPixels(dot.target, this.screen);
    const timing = stage.kind === 'calibrate' ? CALIBRATION_TIMING : VALIDATION_TIMING;
    const settleFraction = timing.settleMs / timing.dwellMs;

    // A ring that shrinks onto the dot draws the eye in; then an arc shows collection progress.
    if (dot.settling) {
      const k = dot.progress / settleFraction;
      ctx.strokeStyle = 'rgba(126, 240, 192, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 48 - 36 * k, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const k = (dot.progress - settleFraction) / (1 - settleFraction);
      ctx.strokeStyle = 'rgba(126, 240, 192, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#7ef0c0';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a101b';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#9fb0c8';
    ctx.font = `15px ${FONT}`;
    const label = stage.kind === 'calibrate' ? 'Calibrating' : 'Checking accuracy';
    ctx.fillText(`${label} · ${dot.step + 1} / ${dot.steps}`, width / 2, height - 28);
  }
}
