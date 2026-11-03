export interface GameConfig {
  /** Length of a round. */
  readonly roundSeconds: number;
  /** Countdown before play starts or resumes. */
  readonly countdownSeconds: number;
  /** Fruit on screen at once. */
  readonly fruitCount: number;

  /** Slowest speed, used when the target is at or near the head (px/s). */
  readonly minSpeed: number;
  /** Fastest speed (px/s). */
  readonly maxSpeed: number;
  /** Speed gained per pixel of distance between head and target (1/s). */
  readonly speedPerPixel: number;
  /** Upper bound on turning (rad/s). */
  readonly maxTurnRate: number;
  /** Tightest turning circle, so slow turns can't fold the snake onto itself (px). */
  readonly minTurnRadius: number;

  /** Distance between body segments (px). */
  readonly segmentSpacing: number;
  /** Segments in a snake with no fruit eaten. */
  readonly baseSegments: number;
  /** Segments added per fruit. */
  readonly segmentsPerFruit: number;
  /** Segments next to the head that are ignored for self-collision. */
  readonly neckSegments: number;
  /** Head-to-segment distance that counts as crossing the body (px). */
  readonly selfHitDistance: number;

  readonly headRadius: number;
  readonly bodyRadius: number;
  readonly fruitRadius: number;
  /** Keep new fruit this far from the board edges (px). */
  readonly fruitEdgeMargin: number;
  /** Keep new fruit this far from the body and other fruit (px). */
  readonly fruitClearance: number;
  /** Keep new fruit this far from the head (px). */
  readonly fruitHeadClearance: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  roundSeconds: 120,
  countdownSeconds: 3,
  fruitCount: 3,

  minSpeed: 30,
  maxSpeed: 260,
  speedPerPixel: 1.2,
  maxTurnRate: 5,
  minTurnRadius: 22,

  segmentSpacing: 6,
  baseSegments: 20,
  segmentsPerFruit: 6,
  neckSegments: 8,
  selfHitDistance: 14,

  headRadius: 12,
  bodyRadius: 10,
  fruitRadius: 10,
  fruitEdgeMargin: 40,
  fruitClearance: 40,
  fruitHeadClearance: 120,
};
