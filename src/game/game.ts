import type { Board } from './board';
import { DEFAULT_CONFIG, type GameConfig } from './config';
import { spawnFruit, type Obstacle } from './fruit';
import type { Rng } from './random';
import { createSnake, findSelfHit, moveSnake, trimTail, type Snake } from './snake';
import { torusDistance, vec, type Vec2 } from './vec';

export type Phase = 'ready' | 'countdown' | 'playing' | 'paused' | 'over';

export type GameEvent =
  | { readonly type: 'go' }
  | { readonly type: 'eat'; readonly at: Vec2; readonly score: number }
  | { readonly type: 'trim'; readonly lost: number; readonly score: number }
  | { readonly type: 'over'; readonly score: number };

export class Game {
  phase: Phase = 'ready';
  snake: Snake;
  fruit: Vec2[] = [];
  /** Fruit currently in the snake; trimming the tail takes points away. */
  score = 0;
  timeLeft: number;
  countdownLeft = 0;
  board: Board;

  private readonly rng: Rng;
  readonly config: GameConfig;

  constructor(board: Board, rng: Rng = Math.random, config: GameConfig = DEFAULT_CONFIG) {
    this.board = board;
    this.rng = rng;
    this.config = config;
    this.snake = this.newSnake();
    this.timeLeft = config.roundSeconds;
  }

  /** Starts a fresh round, beginning with a countdown. */
  start(): void {
    this.snake = this.newSnake();
    this.score = 0;
    this.timeLeft = this.config.roundSeconds;
    this.fruit = [];
    for (let i = 0; i < this.config.fruitCount; i++) this.fruit.push(this.newFruit());
    this.beginCountdown();
  }

  pause(): void {
    if (this.phase === 'playing' || this.phase === 'countdown') this.phase = 'paused';
  }

  /** Resumes via a countdown so the player can settle before the snake moves. */
  resume(): void {
    if (this.phase === 'paused') this.beginCountdown();
  }

  resize(board: Board): void {
    this.board = board;
    const m = this.config.fruitEdgeMargin;
    this.fruit = this.fruit.map((f) =>
      f.x > board.width - m || f.y > board.height - m ? this.newFruit() : f,
    );
  }

  /** Advances the simulation by `dt` seconds towards `target` (screen space). */
  step(dt: number, target: Vec2 | null): GameEvent[] {
    if (this.phase === 'countdown') {
      this.countdownLeft -= dt;
      if (this.countdownLeft > 0) return [];
      this.countdownLeft = 0;
      this.phase = 'playing';
      return [{ type: 'go' }];
    }
    if (this.phase !== 'playing') return [];

    const events: GameEvent[] = [];
    const { board, config, snake } = this;
    moveSnake(snake, target, board, dt, config);

    const reach = config.headRadius + config.fruitRadius;
    this.fruit.forEach((f, i) => {
      if (torusDistance(snake.head, f, board.width, board.height) >= reach) return;
      this.score += 1;
      snake.targetSegments += config.segmentsPerFruit;
      this.fruit[i] = this.newFruit();
      events.push({ type: 'eat', at: f, score: this.score });
    });

    const hit = findSelfHit(snake, board, config);
    if (hit !== null) {
      const kept = trimTail(snake, hit, config);
      events.push({ type: 'trim', lost: this.score - kept, score: kept });
      this.score = kept;
    }

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.phase = 'over';
      events.push({ type: 'over', score: this.score });
    }
    return events;
  }

  private beginCountdown(): void {
    this.phase = 'countdown';
    this.countdownLeft = this.config.countdownSeconds;
  }

  private newSnake(): Snake {
    return createSnake(vec(this.board.width / 2, this.board.height / 2), 0, this.config);
  }

  private newFruit(): Vec2 {
    const { config, snake } = this;
    const obstacles: Obstacle[] = [
      { at: snake.head, clearance: config.fruitHeadClearance },
      ...snake.trail.map((at) => ({ at, clearance: config.fruitClearance })),
      ...this.fruit.map((at) => ({ at, clearance: config.fruitClearance })),
    ];
    return spawnFruit(this.board, obstacles, this.rng, config);
  }
}
