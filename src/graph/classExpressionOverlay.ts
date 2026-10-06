/**
 * Geometry and mark selection for the class-expression overlay (∪ ∩ ¬ {}) — e.g. a "dot on each member
 * edge joined to a central ∪ symbol". Pure (no canvas / network access) so it can be unit-tested.
 * See issues #59-#62.
 */

import type { ClassExpressionGroup } from '../types';

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

/** Which mark a class-expression group is drawn with (issues #59-#62):
 * - `connector`: a dot on each member edge joined to a central badge (2+ members, object property);
 * - `edgeBadge`: one badge on the single member edge (complement, or oneOf of one class);
 * - `nodeBadge`: a corner badge on each counterpart class (oneOf of individuals with no class on the graph);
 * - `stubBadge`: a corner badge on each data-property stub node (data properties: the class→stub edge
 *   is too short for an edge mark);
 * - null: nothing on the graph to anchor it to. */
export type MarkKind = 'connector' | 'edgeBadge' | 'nodeBadge' | 'stubBadge';

export function markKind(group: ClassExpressionGroup): MarkKind | null {
  if (group.propertyKind === 'data') return 'stubBadge';
  if (group.counterparts.length === 0) return null;
  if (group.members.length >= 2) return 'connector';
  if (group.members.length === 1) return 'edgeBadge';
  return 'nodeBadge';
}

/** Fraction along a member edge, measured from its domain end, where the mark sits: near the end the
 * expression is on (¼ for a domain expression, ¾ for a range expression). */
export function badgeFraction(position: ClassExpressionGroup['position']): number {
  return position === 'domain' ? 0.25 : 0.75;
}

export interface NodeBox { left: number; top: number; right: number; bottom: number }

/** Centre of the `index`-th badge on a node corner: domain → top-left, range → top-right, nudged inward
 * so the badge sits ON the corner; further badges on the same corner stack inward along the top edge. */
export function cornerBadgeCenter(box: NodeBox, position: ClassExpressionGroup['position'], index: number, radius: number): Point {
  const inset = radius * 0.6;
  const step = (2 * radius + 2) * index;
  return position === 'range'
    ? { x: box.right - inset - step, y: box.top + inset }
    : { x: box.left + inset + step, y: box.top + inset };
}

/** Hands out a stacking index per node corner, so badges sharing a corner don't overlap. */
export class CornerStacker {
  private counts = new Map<string, number>();
  next(nodeId: string, position: ClassExpressionGroup['position']): number {
    const key = `${nodeId}|${position}`;
    const n = this.counts.get(key) ?? 0;
    this.counts.set(key, n + 1);
    return n;
  }
}

/** Font size for a badge glyph: wider glyphs ("{}") shrink to fit the same circle. */
export function glyphFontSize(glyph: string, base: number): number {
  return [...glyph].length > 1 ? Math.round(base * 0.75) : base;
}
