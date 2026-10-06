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
 * - `nodeBadge`: a corner badge on nodes (see nodeBadgeTargets) when there is no edge to mark: an
 *   enumeration of untyped individuals (on the counterparts), or an expression with no other end — no
 *   range/domain, or owl:Thing (on its own classes);
 * - `stubBadge`: a corner badge on each data-property stub node (data properties: the class→stub edge
 *   is too short for an edge mark);
 * - null: nothing on the graph to anchor it to. */
export type MarkKind = 'connector' | 'edgeBadge' | 'nodeBadge' | 'stubBadge';

export function markKind(group: ClassExpressionGroup): MarkKind | null {
  if (group.propertyKind === 'data') return 'stubBadge';
  if (group.counterparts.length === 0) return group.members.length > 0 ? 'nodeBadge' : null;
  if (group.members.length >= 2) return 'connector';
  if (group.members.length === 1) return 'edgeBadge';
  return 'nodeBadge';
}

/** Nodes that carry a `nodeBadge`: the counterparts when the expression has no member classes, else
 * (no other end) the expression's own classes. */
export function nodeBadgeTargets(group: ClassExpressionGroup): string[] {
  return group.counterparts.length > 0 ? group.counterparts : group.members;
}

/** Split members by whether their edge to `counterpart` is drawn. A missing edge (e.g. a self-loop,
 * which the parser never draws — FOAF `made`: domain Agent, range ¬Agent) can't carry an edge mark,
 * so the renderer puts a corner badge on the counterpart node instead. */
export function partitionByEdge(
  members: string[],
  counterpart: string,
  hasEdge: (member: string, counterpart: string) => boolean,
): { withEdge: string[]; withoutEdge: string[] } {
  const withEdge: string[] = [];
  const withoutEdge: string[] = [];
  for (const m of members) (hasEdge(m, counterpart) ? withEdge : withoutEdge).push(m);
  return { withEdge, withoutEdge };
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

/** Which drawing layer a mark belongs to: `edges` marks (on the relationship edges) are drawn between
 * the edge lines and the edge labels, so labels stay readable over them; `nodes` marks (corner badges
 * overlapping a class or data-property node) are drawn on top of everything, or the node would hide them. */
export type MarkLayer = 'edges' | 'nodes';

export function markLayer(kind: MarkKind): MarkLayer {
  return kind === 'connector' || kind === 'edgeBadge' ? 'edges' : 'nodes';
}

/** Visible edge length (canvas units) at which on-edge badges are drawn at their nominal size. */
export const BADGE_REFERENCE_LENGTH = 120;
/** Limits on the badge scale, so badges stay legible on very short edges and modest on long ones. */
export const BADGE_MIN_SCALE = 0.55;
export const BADGE_MAX_SCALE = 1.3;

/** Size factor for a badge on an edge whose visible part is `visibleLength` long: proportional to the
 * length, clamped to [BADGE_MIN_SCALE, BADGE_MAX_SCALE]; 1 when the length is unknown. */
export function badgeScale(visibleLength: number | null): number {
  if (visibleLength == null || !Number.isFinite(visibleLength)) return 1;
  return Math.min(BADGE_MAX_SCALE, Math.max(BADGE_MIN_SCALE, visibleLength / BADGE_REFERENCE_LENGTH));
}

/** The vis edge ids of the edge from a class to one of its data-property boxes (main.ts builds them as
 * `${classId}->${boxId}:dataprop`, or `:dataproprestrict` for a restriction box). */
export function dataPropertyEdgeIds(classId: string, boxId: string): string[] {
  return [`${classId}->${boxId}:dataprop`, `${classId}->${boxId}:dataproprestrict`];
}

/** The vis edge ids the from→to edge of a property may have: `${from}->${to}:${type}`, where type is
 * the property's local name or full URI (main.ts builds them so). Looking the edge up by id means marks
 * never land on another property's edge between the same classes. */
export function propertyEdgeIds(from: string, to: string, propertyName: string, propertyUri?: string): string[] {
  const prefix = `${from}->${to}:`;
  return propertyUri && propertyUri !== propertyName ? [prefix + propertyName, prefix + propertyUri] : [prefix + propertyName];
}

/** Where a badge sits, which decides the font it follows most. */
export type BadgePlacement = 'edge' | 'node' | 'dataProperty';

/** Each display font setting relative to its default (1 = default; see fontSettingRatios). */
export interface BadgeFontRatios {
  /** Fallback node ratio, for nodes not in `byNode`. */
  node: number;
  relationship: number;
  dataProperty: number;
  /** Per-node ratio (each node's font by depth vs. the default at that depth; see nodeFontRatio). */
  byNode?: Record<string, number>;
}

/** The ratios with `node` set to the mean per-node ratio of `nodeIds` (the nodes a badge relates to),
 * falling back to the overall node ratio for nodes not listed. */
export function ratiosForNodes(ratios: BadgeFontRatios, nodeIds: string[]): BadgeFontRatios {
  if (nodeIds.length === 0) return ratios;
  const each = nodeIds.map((id) => ratios.byNode?.[id] ?? ratios.node);
  return { ...ratios, node: each.reduce((a, b) => a + b, 0) / each.length };
}

export const FONT_SCALE_MIN = 0.5;
export const FONT_SCALE_MAX = 2.5;

/** Weight of each font, per placement: the font of what the badge sits on leads (60%), the others
 * follow (25% / 15%), so changing any font size moves every badge a little and its own a lot. */
const FONT_WEIGHTS: Record<BadgePlacement, { node: number; relationship: number; dataProperty: number }> = {
  edge: { relationship: 0.6, node: 0.25, dataProperty: 0.15 },
  node: { node: 0.6, relationship: 0.25, dataProperty: 0.15 },
  dataProperty: { dataProperty: 0.6, relationship: 0.25, node: 0.15 },
};

/** Size factor for a badge from the display font settings: a weighted average of the font ratios,
 * clamped to [FONT_SCALE_MIN, FONT_SCALE_MAX]. 1 at the default fonts. */
export function badgeFontScale(placement: BadgePlacement, ratios: BadgeFontRatios): number {
  const w = FONT_WEIGHTS[placement];
  const scale = w.node * ratios.node + w.relationship * ratios.relationship + w.dataProperty * ratios.dataProperty;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, scale));
}
