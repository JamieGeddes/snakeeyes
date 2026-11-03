export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec = (x: number, y: number): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => vec(a.x + b.x, a.y + b.y);

export const sub = (a: Vec2, b: Vec2): Vec2 => vec(a.x - b.x, a.y - b.y);

export const scale = (a: Vec2, k: number): Vec2 => vec(a.x * k, a.y * k);

export const length = (a: Vec2): number => Math.hypot(a.x, a.y);

export const distance = (a: Vec2, b: Vec2): number => length(sub(a, b));

/** Wraps a point onto a torus of the given size, so it re-enters from the opposite edge. */
export const wrap = (p: Vec2, width: number, height: number): Vec2 =>
  vec(((p.x % width) + width) % width, ((p.y % height) + height) % height);

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const fromAngle = (angle: number): Vec2 => vec(Math.cos(angle), Math.sin(angle));

export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);

/** Signed smallest rotation from `from` to `to`, in the range (-PI, PI]. */
export const angleDiff = (from: number, to: number): number => {
  const d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) return d - 2 * Math.PI;
  if (d <= -Math.PI) return d + 2 * Math.PI;
  return d;
};

/** Shortest displacement from `from` to `to` on a board whose edges wrap. */
export const torusDelta = (from: Vec2, to: Vec2, width: number, height: number): Vec2 => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return vec(dx - width * Math.round(dx / width), dy - height * Math.round(dy / height));
};

export const torusDistance = (a: Vec2, b: Vec2, width: number, height: number): number =>
  length(torusDelta(a, b, width, height));
