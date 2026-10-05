/**
 * Geometry for the class-expression overlay (union domains etc.) — rendering a "dot on each member
 * edge joined to a central ∪ symbol". Pure (no canvas / network access) so it can be unit-tested.
 * See issue #59.
 */

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Centre point of a box. */
export function boxCenter(box: Box): Point {
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
}

/** Average of points (the hub where the union connectors meet). */
export function centroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

/** Linear interpolation between a and b at t in [0,1]. */
export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** True when `p` is within `radius` of `center`. */
export function pointNear(p: Point, center: Point, radius: number): boolean {
  return Math.hypot(p.x - center.x, p.y - center.y) <= radius;
}

/** Shortest distance from point p to segment a–b. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** True when p is within `tol` of segment a–b. */
export function pointNearSegment(p: Point, a: Point, b: Point, tol: number): boolean {
  return distanceToSegment(p, a, b) <= tol;
}
