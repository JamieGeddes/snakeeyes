import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { Game } from './game';
import { mulberry32 } from './random';
import { torusDistance, vec } from './vec';

const board = { width: 800, height: 600 };
const dt = 1 / 60;
const farRight = vec(790, 300);

function playing(): Game {
  const g = new Game(board, mulberry32(1));
  g.start();
  g.step(cfg.countdownSeconds, null);
  return g;
}

describe('Game phases', () => {
  it('starts with a countdown, then plays', () => {
    const g = new Game(board, mulberry32(1));
    expect(g.phase).toBe('ready');
    g.start();
    expect(g.phase).toBe('countdown');
    expect(g.fruit).toHaveLength(cfg.fruitCount);
    expect(g.step(cfg.countdownSeconds / 2, null)).toEqual([]);
    expect(g.step(cfg.countdownSeconds / 2, null)).toEqual([{ type: 'go' }]);
    expect(g.phase).toBe('playing');
  });

  it('freezes while paused and resumes through a countdown', () => {
    const g = playing();
    g.pause();
    expect(g.phase).toBe('paused');
    const head = g.snake.head;
    expect(g.step(dt, farRight)).toEqual([]);
    expect(g.snake.head).toEqual(head);
    g.resume();
    expect(g.phase).toBe('countdown');
  });

  it('ignores pause before a round starts', () => {
    const g = new Game(board, mulberry32(1));
    g.pause();
    expect(g.phase).toBe('ready');
  });

  it('ends the round when time runs out', () => {
    const g = playing();
    g.timeLeft = dt / 2;
    expect(g.step(dt, farRight)).toEqual([{ type: 'over', score: 0 }]);
    expect(g.phase).toBe('over');
    expect(g.timeLeft).toBe(0);
  });

  it('resets score, snake and clock on restart', () => {
    const g = playing();
    g.score = 4;
    g.timeLeft = 5;
    g.start();
    expect(g.score).toBe(0);
    expect(g.timeLeft).toBe(cfg.roundSeconds);
    expect(g.snake.trail).toHaveLength(cfg.baseSegments);
  });
});

describe('Game play', () => {
  it('eats fruit, grows and respawns the fruit away from the head', () => {
    const g = playing();
    g.fruit[0] = vec(g.snake.head.x + 10, g.snake.head.y);
    const events = g.step(dt, farRight);
    expect(events).toContainEqual(expect.objectContaining({ type: 'eat', score: 1 }));
    expect(g.score).toBe(1);
    expect(g.snake.targetSegments).toBe(cfg.baseSegments + cfg.segmentsPerFruit);
    const f = g.fruit[0] ?? vec(0, 0);
    expect(torusDistance(f, g.snake.head, board.width, board.height)).toBeGreaterThan(
      cfg.headRadius + cfg.fruitRadius,
    );
  });

  it('trims the tail and drops the score when the snake crosses itself', () => {
    const g = playing();
    g.fruit = [];
    const head = vec(400, 300);
    g.snake.head = head;
    g.snake.heading = 0;
    // Neck runs left from the head; the rest is far away except one segment just ahead.
    g.snake.trail = Array.from({ length: 50 }, (_, i) =>
      i < 8 ? vec(head.x - 5 - 6 * i, head.y) : vec(100, 100 + i),
    );
    g.snake.trail[30] = vec(head.x + 5, head.y);
    g.snake.targetSegments = 50;
    g.score = 5;

    // Moving lays one new segment at the front, so the crossed segment becomes index 31.
    const events = g.step(dt, farRight);
    expect(events).toContainEqual({ type: 'trim', lost: 4, score: 1 });
    expect(g.score).toBe(1);
    expect(g.snake.trail).toHaveLength(31);
    expect(g.snake.targetSegments).toBe(cfg.baseSegments + cfg.segmentsPerFruit);
  });

  it('moves fruit that fall outside a smaller board', () => {
    const g = playing();
    g.fruit = [vec(700, 500)];
    g.resize({ width: 400, height: 300 });
    const f = g.fruit[0] ?? vec(0, 0);
    expect(f.x).toBeLessThanOrEqual(400 - cfg.fruitEdgeMargin);
    expect(f.y).toBeLessThanOrEqual(300 - cfg.fruitEdgeMargin);
  });
});
