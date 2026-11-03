import type { Board } from './board';
import type { GameConfig } from './config';
import {
  add,
  angleDiff,
  angleOf,
  clamp,
  distance,
  fromAngle,
  length,
  scale,
  sub,
  torusDistance,
  wrap,
  type Vec2,
} from './vec';

export interface Snake {
  /** Head position in unwrapped world space; wrap it to get the on-screen position. */
  head: Vec2;
  /** Direction of travel in radians. */
  heading: number;
  /** Current speed in px/s. */
  speed: number;
  /** Body points behind the head, nearest first, exactly `segmentSpacing` apart (unwrapped). */
  trail: Vec2[];
  /** Segment count the snake grows towards. */
  targetSegments: number;
}

export function createSnake(start: Vec2, heading: number, config: GameConfig): Snake {
  const back = fromAngle(heading + Math.PI);
  const trail = Array.from({ length: config.baseSegments }, (_, i) =>
    add(start, scale(back, config.segmentSpacing * (i + 1))),
  );
  return {
    head: start,
    heading,
    speed: config.minSpeed,
    trail,
    targetSegments: config.baseSegments,
  };
}

export function speedForDistance(dist: number, config: GameConfig): number {
  return clamp(dist * config.speedPerPixel, config.minSpeed, config.maxSpeed);
}

/** Turn rate allowed at a given speed, respecting the minimum turning circle. */
export function turnRateForSpeed(speed: number, config: GameConfig): number {
  return Math.min(config.maxTurnRate, speed / config.minTurnRadius);
}

/**
 * Steers towards `target` (screen space) and advances the snake by `dt` seconds.
 * With no target the snake keeps its heading and speed.
 */
export function moveSnake(
  snake: Snake,
  target: Vec2 | null,
  board: Board,
  dt: number,
  config: GameConfig,
): void {
  if (target) {
    const toTarget = sub(target, wrap(snake.head, board.width, board.height));
    const dist = length(toTarget);
    snake.speed = speedForDistance(dist, config);
    if (dist > 1e-6) {
      const limit = turnRateForSpeed(snake.speed, config) * dt;
      snake.heading += clamp(angleDiff(snake.heading, angleOf(toTarget)), -limit, limit);
    }
  }
  snake.head = add(snake.head, scale(fromAngle(snake.heading), snake.speed * dt));
  layTrail(snake, config);
}

function layTrail(snake: Snake, config: GameConfig): void {
  let nearest = snake.trail[0];
  if (!nearest) {
    snake.trail.push(snake.head);
    return;
  }
  let gap = distance(snake.head, nearest);
  while (gap >= config.segmentSpacing) {
    nearest = add(nearest, scale(sub(snake.head, nearest), config.segmentSpacing / gap));
    snake.trail.unshift(nearest);
    gap = distance(snake.head, nearest);
  }
  if (snake.trail.length > snake.targetSegments) snake.trail.length = snake.targetSegments;
}

/** Index of the first body segment the head is crossing, or null. */
export function findSelfHit(snake: Snake, board: Board, config: GameConfig): number | null {
  for (let i = config.neckSegments; i < snake.trail.length; i++) {
    const p = snake.trail[i];
    if (p && torusDistance(snake.head, p, board.width, board.height) < config.selfHitDistance) {
      return i;
    }
  }
  return null;
}

/**
 * Cuts the body at `index` and returns how many fruit the remaining snake still holds.
 * The snake's target length is reset to match, so it doesn't regrow the lost tail.
 */
export function trimTail(snake: Snake, index: number, config: GameConfig): number {
  snake.trail.length = Math.min(snake.trail.length, index);
  const kept = Math.max(0, Math.floor((index - config.baseSegments) / config.segmentsPerFruit));
  snake.targetSegments = config.baseSegments + kept * config.segmentsPerFruit;
  return kept;
}
