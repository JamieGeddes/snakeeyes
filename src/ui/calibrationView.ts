import {
  CALIBRATION_POINTS,
  CALIBRATION_TIMING,
  DotSequence,
  evaluateValidation,
  fitCalibration,
  HEAD_MOVE_POINTS,
  HEAD_MOVE_TIMING,
  HEAD_TEST_POINTS,
  HEAD_TEST_TIMING,
  MIN_DOTS,
  MIN_SAMPLES_PER_DOT,
  toPixels,
  VALIDATION_POINTS,
  VALIDATION_TIMING,
  type DotTiming,
  type GeometricModel,
  type ValidationResult,
} from '../gaze/calibration';
import { toGazeSample } from '../gaze/features';
import type { TrackingSample } from '../tracking/protocol';

export interface CalibrationSequences {
  readonly calibration: DotSequence;
  readonly headMove: DotSequence;
  readonly validation: DotSequence;
}

export type CalibrationResult =
  | {
      readonly ok: true;
      readonly model: GeometricModel;
      readonly validation: ValidationResult;
      readonly sequences: CalibrationSequences;
    }
  | { readonly ok: false; readonly reason: string };

const MESSAGE_MS = 2500;
const FONT = 'system-ui, sans-serif';
const UNCLEAR_EYES =
  "Your eyes weren't visible clearly enough. Check your face is well lit and in view of the camera, then try again.";

/** Prompts for the head-move step, each shown for an equal share of it. */
export const HEAD_PROMPTS = [
  'Slowly turn your head left and right',
  'Now slowly nod up and down',
  'Now slowly lean towards the screen and back',
] as const;

type Stage =
  | { kind: 'message'; title: string; subtitle: string; until: number }
  | {
      kind: 'dots';
      seq: DotSequence;
      timing: DotTiming;
      label: string;
      prompt: (progress: number) => string;
    };

/**
 * Fullscreen, hands-free calibration: 9 dots with the head still, a head-move step
 * looking at one dot, then 4 dots to measure accuracy. Feed it tracking samples via
 * `handleSample` while it runs.
 */
export class CalibrationView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private stage: Stage | null = null;
  private stageDone: (() => void) | null = null;
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

  /** Runs the full calibration. If cancelled, the promise never settles. */
  async run(): Promise<CalibrationResult> {
    this.start();
    await this.message('Follow the dot with your eyes', 'Keep your head still. Blinking is fine.');

    const calibration = new DotSequence(CALIBRATION_POINTS, CALIBRATION_TIMING);
    await this.dots(calibration, CALIBRATION_TIMING, 'Calibrating · keep your head still');
    const usable = calibration.samples.filter((s) => s.length >= MIN_SAMPLES_PER_DOT).length;
    if (usable < MIN_DOTS) return this.end({ ok: false, reason: UNCLEAR_EYES });

    await this.message(
      'Now keep looking at the dot and move your head',
      'Slowly turn, then nod, then lean towards the screen and back. Follow the prompts.',
    );
    const headMove = new DotSequence(HEAD_MOVE_POINTS, HEAD_MOVE_TIMING);
    await this.dots(headMove, HEAD_MOVE_TIMING, 'Head movement', (progress) => {
      const i = Math.min(HEAD_PROMPTS.length - 1, Math.floor(progress * HEAD_PROMPTS.length));
      return HEAD_PROMPTS[i] ?? '';
    });

    const model = fitCalibration(calibration, this.screen, headMove);
    if (!model) return this.end({ ok: false, reason: UNCLEAR_EYES });

    await this.message('Last part: follow the dot again', 'Keep your head still.');
    const validation = new DotSequence(VALIDATION_POINTS, VALIDATION_TIMING);
    await this.dots(
      validation,
      VALIDATION_TIMING,
      'Checking accuracy',
      () => 'Keep your head still',
    );
    return this.end({
      ok: true,
      model,
      validation: evaluateValidation(model, validation),
      sequences: { calibration, headMove, validation },
    });
  }

  /** Accuracy test with natural head movement, for the gaze check page. */
  async runHeadTest(): Promise<DotSequence> {
    this.start();
    await this.message(
      'Follow the dot, moving your head naturally',
      'Turn, tilt and lean a little, as you would while playing.',
    );
    const seq = new DotSequence(HEAD_TEST_POINTS, HEAD_TEST_TIMING);
    await this.dots(seq, HEAD_TEST_TIMING, 'Head-move test · move your head naturally');
    return this.end(seq);
  }

  cancel(): void {
    cancelAnimationFrame(this.frame);
    this.stage = null;
    this.stageDone = null;
  }

  handleSample(sample: TrackingSample): void {
    const stage = this.stage;
    if (stage?.kind === 'dots') stage.seq.update(sample.t, toGazeSample(sample));
  }

  private start(): void {
    this.cancel();
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }

  private end<T>(result: T): T {
    this.cancel();
    this.clear();
    return result;
  }

  private message(title: string, subtitle: string): Promise<void> {
    return this.show({ kind: 'message', title, subtitle, until: performance.now() + MESSAGE_MS });
  }

  private dots(
    seq: DotSequence,
    timing: DotTiming,
    label: string,
    prompt: (progress: number) => string = () => '',
  ): Promise<void> {
    return this.show({ kind: 'dots', seq, timing, label, prompt });
  }

  private show(stage: Stage): Promise<void> {
    this.stage = stage;
    return new Promise((resolve) => {
      this.stageDone = resolve;
    });
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
    const finished =
      stage.kind === 'message' ? now >= stage.until : (stage.seq.update(now), stage.seq.done);
    if (finished) {
      const done = this.stageDone;
      this.stageDone = null;
      done?.();
    } else {
      this.draw(stage, now);
    }
    // The next stage, if any, is set by the awaiting code before the next frame.
    if (this.stage) this.frame = requestAnimationFrame(this.tick);
  };

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

    if (stage.kind === 'message') {
      ctx.fillStyle = '#e6edf7';
      ctx.font = `600 28px ${FONT}`;
      ctx.fillText(stage.title, width / 2, height / 2);
      ctx.fillStyle = '#9fb0c8';
      ctx.font = `18px ${FONT}`;
      ctx.fillText(stage.subtitle, width / 2, height / 2 + 40);
      return;
    }

    const dot = stage.seq.current(now);
    if (!dot) return;
    const p = toPixels(dot.target, this.screen);
    const settleFraction = stage.timing.settleMs / stage.timing.dwellMs;

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

    // Prompts sit just above the dot so reading them barely moves the eyes.
    const prompt = stage.prompt(dot.progress);
    if (prompt) {
      ctx.fillStyle = '#e6edf7';
      ctx.font = `600 20px ${FONT}`;
      ctx.fillText(prompt, p.x, p.y - 44);
    }

    ctx.fillStyle = '#9fb0c8';
    ctx.font = `15px ${FONT}`;
    ctx.fillText(`${stage.label} · ${dot.step + 1} / ${dot.steps}`, width / 2, height - 28);
  }
}
