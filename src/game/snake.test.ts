import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import {
  createSnake,
  findSelfHit,
  moveSnake,
  speedForDistance,
  trimTail,
  turnRateForSpeed,
  type Snake,
} from './snake';
import { distance, vec } from './vec';

const board = { width: 800, height: 600 };
const dt = 1 / 60;

const spacings = (s: Snake): number[] =>
  s.trail.slice(1).map((p, i) => distance(p, s.trail[i] ?? p));

describe('createSnake', () => {
  it('lays the base body straight behind the head at even spacing', () => {
    const s = createSnake(vec(400, 300), 0, cfg);
    expect(s.trail).toHaveLength(cfg.baseSegments);
    expect(s.trail[0]?.x).toBeCloseTo(400 - cfg.segmentSpacing);
    expect(s.trail[0]?.y).toBeCloseTo(300);
    for (const d of spacings(s)) expect(d).toBeCloseTo(cfg.segmentSpacing);
  });
});

describe('speed and turning', () => {
  it('scales speed with distance between the limits', () => {
    expect(speedForDistance(0, cfg)).toBe(cfg.minSpeed);
    expect(speedForDistance(100, cfg)).toBeCloseTo(100 * cfg.speedPerPixel);
    expect(speedForDistance(5000, cfg)).toBe(cfg.maxSpeed);
  });

  it('limits turn rate at low speed to keep a minimum turning circle', () => {
    expect(turnRateForSpeed(cfg.minSpeed, cfg)).toBeCloseTo(cfg.minSpeed / cfg.minTurnRadius);
    expect(turnRateForSpeed(cfg.maxSpeed, cfg)).toBe(cfg.maxTurnRate);
  });
});

describe('moveSnake', () => {
  it('moves towards a target ahead and keeps segments evenly spaced', () => {
    const s = createSnake(vec(100, 300), 0, cfg);
    for (let i = 0; i < 60; i++) moveSnake(s, vec(790, 300), board, dt, cfg);
    expect(s.head.x).toBeGreaterThan(300);
    expect(s.head.y).toBeCloseTo(300);
    expect(s.trail).toHaveLength(cfg.baseSegments);
    for (const d of spacings(s)) expect(d).toBeCloseTo(cfg.segmentSpacing);
  });

  it('caps how far it turns in one step', () => {
    const s = createSnake(vec(400, 300), 0, cfg);
    moveSnake(s, vec(400, 100), board, dt, cfg);
    const speed = speedForDistance(200, cfg);
    expect(s.heading).toBeCloseTo(-turnRateForSpeed(speed, cfg) * dt);
  });

  it('keeps heading and speed when there is no target', () => {
    const s = createSnake(vec(400, 300), 1, cfg);
    s.speed = 100;
    moveSnake(s, null, board, dt, cfg);
    expect(s.heading).toBe(1);
    expect(s.speed).toBe(100);
  });

  it('steers from the on-screen head position after wrapping', () => {
    // Unwrapped x 1610 is x 10 on an 800 px board, so a target at x 100 is straight ahead.
    const s = createSnake(vec(1610, 300), 0, cfg);
    moveSnake(s, vec(100, 300), board, dt, cfg);
    expect(s.heading).toBeCloseTo(0);
    expect(s.speed).toBeCloseTo(speedForDistance(90, cfg));
  });

  it('grows towards the target segment count as it moves', () => {
    const s = createSnake(vec(100, 300), 0, cfg);
    s.targetSegments = cfg.baseSegments + cfg.segmentsPerFruit;
    for (let i = 0; i < 60; i++) moveSnake(s, vec(790, 300), board, dt, cfg);
    expect(s.trail).toHaveLength(s.targetSegments);
  });
});

describe('findSelfHit', () => {
  const straight = (): Snake => createSnake(vec(400, 300), 0, cfg);

  it('ignores the neck', () => {
    const s = straight();
    s.head = s.trail[3] ?? s.head;
    expect(findSelfHit(s, board, cfg)).toBeNull();
  });

  it('returns the first crossed segment beyond the neck', () => {
    const s = straight();
    s.head = s.trail[15] ?? s.head;
    // Segments 13 to 17 lie within the hit distance; 13 is first.
    expect(findSelfHit(s, board, cfg)).toBe(13);
  });

  it('detects hits across a wrapped edge', () => {
    const s = straight();
    const p = s.trail[15] ?? s.head;
    s.head = vec(p.x + board.width, p.y);
    expect(findSelfHit(s, board, cfg)).toBe(13);
  });
});

describe('trimTail', () => {
  it('cuts the body and keeps only whole fruit still in the snake', () => {
    const s = createSnake(vec(400, 300), 0, cfg);
    s.targetSegments = cfg.baseSegments + 5 * cfg.segmentsPerFruit;
    const kept = trimTail(s, cfg.baseSegments + 2 * cfg.segmentsPerFruit + 3, cfg);
    expect(kept).toBe(2);
    expect(s.targetSegments).toBe(cfg.baseSegments + 2 * cfg.segmentsPerFruit);
  });

  it('keeps no fruit when cut inside the base body', () => {
    const s = createSnake(vec(400, 300), 0, cfg);
    expect(trimTail(s, 10, cfg)).toBe(0);
    expect(s.trail).toHaveLength(10);
    expect(s.targetSegments).toBe(cfg.baseSegments);
  });
});
