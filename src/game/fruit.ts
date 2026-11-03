import type { Board } from './board';
import type { GameConfig } from './config';
import type { Rng } from './random';
import { torusDistance, vec, type Vec2 } from './vec';

export interface Obstacle {
  readonly at: Vec2;
  readonly clearance: number;
}

/**
 * Picks a random spot away from the edges and every obstacle.
 * If no clear spot is found within `attempts`, the last candidate is used.
 */
export function spawnFruit(
  board: Board,
  obstacles: readonly Obstacle[],
  rng: Rng,
  config: GameConfig,
  attempts = 40,
): Vec2 {
  const mx = Math.min(config.fruitEdgeMargin, board.width / 2);
  const my = Math.min(config.fruitEdgeMargin, board.height / 2);
  let candidate = vec(board.width / 2, board.height / 2);
  for (let i = 0; i < attempts; i++) {
    candidate = vec(mx + rng() * (board.width - 2 * mx), my + rng() * (board.height - 2 * my));
    const at = candidate;
    const clear = obstacles.every(
      (o) => torusDistance(o.at, at, board.width, board.height) >= o.clearance,
    );
    if (clear) return candidate;
  }
  return candidate;
}
