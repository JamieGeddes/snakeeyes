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
