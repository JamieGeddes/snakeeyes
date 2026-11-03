import type { Game } from '../game/game';
import { add, angleOf, fromAngle, scale, sub, wrap, type Vec2 } from '../game/vec';

const HEAD_COLOUR: Rgb = [126, 240, 192];
const TAIL_COLOUR: Rgb = [47, 143, 157];
const TAIL_RADIUS_RATIO = 0.55;
const HEAD_FILL = `rgb(${HEAD_COLOUR.join(',')})`;

type Rgb = readonly [number, number, number];

const mix = (a: Rgb, b: Rgb, t: number): string =>
  `rgb(${a.map((v, i) => Math.round(v + ((b[i] ?? v) - v) * t)).join(',')})`;

export interface FrameInfo {
  readonly target: Vec2 | null;
  readonly best: number;
  /** Seconds since the page loaded, for animation. */
  readonly time: number;
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.canvas = canvas;
    this.ctx = ctx;
  }

  resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(game: Game, frame: FrameInfo): void {
    this.drawBackground();
    if (game.phase !== 'ready') {
      game.fruit.forEach((f, i) => this.drawFruit(f, game.config.fruitRadius, frame.time, i));
      this.drawSnake(game, frame.target);
    }
    if (frame.target && game.phase !== 'ready' && game.phase !== 'over') {
      this.drawGazeMarker(frame.target);
    }
    if (game.phase !== 'ready') this.drawHud(game, frame.best);
    if (game.phase === 'countdown') this.drawCountdown(game.countdownLeft);
  }

  private drawBackground(): void {
    const { ctx, width, height } = this;
    const g = ctx.createRadialGradient(
      width / 2,
      height / 2,
      0,
      width / 2,
      height / 2,
      Math.hypot(width, height) / 2,
    );
    g.addColorStop(0, '#16233a');
    g.addColorStop(1, '#0a101b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  private drawFruit(at: Vec2, radius: number, time: number, index: number): void {
    const { ctx } = this;
    const r = radius * (1 + 0.06 * Math.sin(time * 4 + index * 2.1));

    const glow = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, r * 3.2);
    glow.addColorStop(0, 'rgba(255, 120, 110, 0.45)');
    glow.addColorStop(1, 'rgba(255, 120, 110, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(at.x, at.y, r * 3.2, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(at.x - r * 0.35, at.y - r * 0.35, r * 0.1, at.x, at.y, r);
    body.addColorStop(0, '#ffb3a1');
    body.addColorStop(1, '#e8434f');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#6fd38a';
    ctx.beginPath();
    ctx.ellipse(at.x + r * 0.3, at.y - r * 1.05, r * 0.45, r * 0.2, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawSnake(game: Game, target: Vec2 | null): void {
    const { width, height } = this;
    const { snake, config } = game;
    const onScreen = wrap(snake.head, width, height);
    const shift = sub(onScreen, snake.head);
    // Draw tail first so the head sits on top.
    const body = snake.trail.map((p) => add(p, shift)).reverse();

    const margin = config.headRadius * 2;
    let minX = onScreen.x;
    let maxX = onScreen.x;
    let minY = onScreen.y;
    let maxY = onScreen.y;
    for (const p of body) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    // Draw copies offset by the board size so the body appears seamlessly across wrapped edges.
    for (const ox of [-width, 0, width]) {
      for (const oy of [-height, 0, height]) {
        const visible =
          maxX + ox > -margin &&
          minX + ox < width + margin &&
          maxY + oy > -margin &&
          minY + oy < height + margin;
        if (!visible) continue;
        this.drawBody(body, ox, oy, config.bodyRadius);
        this.drawHead(add(onScreen, { x: ox, y: oy }), snake.heading, target, config.headRadius);
      }
    }
  }

  private drawBody(body: readonly Vec2[], ox: number, oy: number, radius: number): void {
    const { ctx } = this;
    const n = body.length;
    body.forEach((p, i) => {
      const t = n > 1 ? i / (n - 1) : 1; // 0 at tail, 1 at neck
      ctx.fillStyle = mix(TAIL_COLOUR, HEAD_COLOUR, t);
      ctx.beginPath();
      ctx.arc(
        p.x + ox,
        p.y + oy,
        radius * (TAIL_RADIUS_RATIO + (1 - TAIL_RADIUS_RATIO) * t),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    });
  }

  private drawHead(at: Vec2, heading: number, target: Vec2 | null, radius: number): void {
    const { ctx } = this;
    ctx.fillStyle = HEAD_FILL;
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    ctx.fill();

    const forward = fromAngle(heading);
    const side = fromAngle(heading + Math.PI / 2);
    const look = target ? fromAngle(angleOf(sub(target, at))) : forward;
    for (const s of [-1, 1]) {
      const eye = add(add(at, scale(forward, radius * 0.35)), scale(side, s * radius * 0.45));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(eye.x, eye.y, radius * 0.32, 0, Math.PI * 2);
      ctx.fill();
      const pupil = add(eye, scale(look, radius * 0.14));
      ctx.fillStyle = '#10202c';
      ctx.beginPath();
      ctx.arc(pupil.x, pupil.y, radius * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawGazeMarker(at: Vec2): void {
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(230, 237, 247, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(at.x, at.y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(230, 237, 247, 0.2)';
    ctx.beginPath();
    ctx.arc(at.x, at.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawHud(game: Game, best: number): void {
    const { ctx, width } = this;
    const secs = Math.ceil(game.timeLeft);
    const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(230, 237, 247, 0.85)';
    ctx.textAlign = 'left';
    ctx.fillText(`Score ${game.score}`, 24, 20);
    ctx.textAlign = 'right';
    ctx.fillText(`Best ${Math.max(best, game.score)}`, width - 24, 20);
    ctx.textAlign = 'center';
    ctx.fillStyle = secs <= 10 ? '#ffb36b' : 'rgba(230, 237, 247, 0.85)';
    ctx.fillText(clock, width / 2, 20);
  }

  private drawCountdown(left: number): void {
    const { ctx, width, height } = this;
    ctx.font = '700 96px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(230, 237, 247, 0.9)';
    ctx.fillText(String(Math.ceil(left)), width / 2, height / 2);
  }
}
