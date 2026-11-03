import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { spawnFruit } from './fruit';
import { mulberry32 } from './random';
import { torusDistance, vec } from './vec';

const board = { width: 800, height: 600 };

describe('spawnFruit', () => {
  it('stays inside the edge margin', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      const f = spawnFruit(board, [], rng, cfg);
      expect(f.x).toBeGreaterThanOrEqual(cfg.fruitEdgeMargin);
      expect(f.x).toBeLessThanOrEqual(board.width - cfg.fruitEdgeMargin);
      expect(f.y).toBeGreaterThanOrEqual(cfg.fruitEdgeMargin);
      expect(f.y).toBeLessThanOrEqual(board.height - cfg.fruitEdgeMargin);
    }
  });

  it('keeps clear of obstacles', () => {
    const rng = mulberry32(2);
    const obstacle = { at: vec(400, 300), clearance: 250 };
    for (let i = 0; i < 100; i++) {
      const f = spawnFruit(board, [obstacle], rng, cfg);
      expect(torusDistance(f, obstacle.at, board.width, board.height)).toBeGreaterThanOrEqual(250);
    }
  });

  it('still returns an on-board spot when nowhere is clear', () => {
    const f = spawnFruit(board, [{ at: vec(400, 300), clearance: 5000 }], mulberry32(3), cfg);
    expect(f.x).toBeGreaterThanOrEqual(0);
    expect(f.x).toBeLessThanOrEqual(board.width);
  });
});
