/**
 * Canvas renderer for anonymous class-expression groups on OBJECT properties (e.g. an owl:unionOf
 * domain whose members all point at one range class). The property is flattened into one edge per
 * member class; this draws a small "dot" at ¼ of each edge from the domain end (¾ for a range union),
 * joined by thin lines to a central ∪ symbol. The connector borrows the colour of the connected
 * relationship edges. A long connector is "broken" into a short inward arrow-stub (with its own small
 * ∪) so distant members don't drag long lines across the graph. It signals the union without a node,
 * an extra arrow, or a bulky hull, and generalises to any number of members. Clicking/hovering the
 * symbol or its connectors reports the union.
 *
 * Data-property unions use a different mark: their class→stub edge is too short for the edge overlay,
 * so a small ∪ badge is drawn overlapping a corner of each member's stub node (the node label stays
 * the plain property name). Kept out of main.ts. See issue #59.
 */
import type { ClassExpressionGroup } from '../types';
import {
  centroid,
  lerp,
  pointNear,
  pointNearSegment,
  type Point,
} from '../graph/classExpressionOverlay';

const GLYPH: Record<ClassExpressionGroup['operator'], string> = { union: '∪' };
const FALLBACK_COLOR = 'rgba(120, 90, 160, 0.95)';
const DATA_FALLBACK_COLOR = '#4a90a4'; // data-property edge teal, when the edge colour can't be read
const HUB_RADIUS = 13;
const DOT_RADIUS = 4;
const SEGMENT_HIT_TOLERANCE = 6;
/** Beyond this connector length, break the line into a short inward arrow-stub to de-clutter. */
const BREAK_THRESHOLD = 240;
const STUB_LEN = 66;
const ARROW_SIZE = 9;
/** Central ∪ badge (whole connector) vs. the per-arrow ∪ badges (broken connector). */
const HUB_GLYPH_SIZE = 20;
const STUB_BADGE_RADIUS = 10;
const STUB_GLYPH_SIZE = 16;

/** A vis edge, as far as this renderer pokes at it. `edgeType.getPoint(t)` samples the real (possibly
 * curved) rendered path at fraction t (0 = `from`, 1 = `to`), tracking the via-node live. */
interface EdgeLike {
  fromId?: string;
  toId?: string;
  options?: { color?: unknown };
  edgeType?: { getPoint?(t: number): { x: number; y: number } };
}

/** The subset of the vis Network API this renderer needs. */
export interface OverlayNet {
  getPositions(ids: string[]): Record<string, { x: number; y: number }>;
  getBoundingBox?(id: string): { top: number; left: number; right: number; bottom: number };
  body?: { edges?: Record<string, EdgeLike> };
}

interface Region { group: ClassExpressionGroup; center: Point; radius: number; segments: Array<[Point, Point]> }

export interface ClassExpressionOverlay {
  /** Draw every group's overlay; call from the network's `afterDrawing` hook (canvas coords). */
  draw(net: OverlayNet, ctx: CanvasRenderingContext2D, groups: ClassExpressionGroup[]): void;
  /** The group whose symbol / connector is under a canvas-space point, or null. */
  groupAt(point: Point): ClassExpressionGroup | null;
}

function nodePos(net: OverlayNet, id: string): Point | null {
  try {
    const p = net.getPositions([id])[id];
    if (p && Number.isFinite(p.x)) return { x: p.x, y: p.y };
  } catch { /* missing */ }
  return null;
}

interface NodeBox { left: number; top: number; right: number; bottom: number }

function nodeBox(net: OverlayNet, id: string): NodeBox | null {
  if (!net.getBoundingBox) return null;
  try {
    const bb = net.getBoundingBox(id);
    if (bb && Number.isFinite(bb.left)) return { left: bb.left, top: bb.top, right: bb.right, bottom: bb.bottom };
  } catch { /* not laid out */ }
  return null;
}

/** The stub node id carrying a data-property for one union member, or null if it isn't on the graph. */
function dataStubId(net: OverlayNet, group: ClassExpressionGroup, member: string): string | null {
  for (const id of [`__dataprop__${member}__${group.propertyName}`, `__dataproprestrict__${member}__${group.propertyName}`]) {
    if (nodePos(net, id)) return id;
  }
  return null;
}

/** The edge between two nodes (either direction), or null. */
function findEdge(net: OverlayNet, a: string, b: string): EdgeLike | null {
  const edges = net.body?.edges;
  if (!edges) return null;
  for (const key in edges) {
    const e = edges[key];
    if ((e.fromId === a && e.toId === b) || (e.fromId === b && e.toId === a)) return e;
  }
  return null;
}

/** Edge colour, so the overlay matches the relationship it groups. */
function colorOf(edge: EdgeLike): string | null {
  const c = edge.options?.color;
  if (typeof c === 'string') return c;
  if (c && typeof c === 'object' && typeof (c as { color?: unknown }).color === 'string') {
    return (c as { color: string }).color;
  }
  return null;
}

/** The point at fraction t from `member`'s end along the edge's real (curved) path, or null if the
 * edge can't be sampled. Samples the actual rendered curve so the dot tracks curve reshaping — a
 * straight chord's ¼ point is invariant to moving a shared range node, the real curve's is not. */
function edgePoint(edge: EdgeLike | null, member: string, t: number): Point | null {
  if (!edge?.edgeType?.getPoint) return null;
  const tEff = edge.fromId === member ? t : 1 - t;
  try {
    const p = edge.edgeType.getPoint(tEff);
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y };
  } catch { /* via node not computed yet */ }
  return null;
}

function drawArrowhead(ctx: CanvasRenderingContext2D, tip: Point, from: Point, size: number, color: string): void {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
  const spread = Math.PI / 7;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - size * Math.cos(ang - spread), tip.y - size * Math.sin(ang - spread));
  ctx.lineTo(tip.x - size * Math.cos(ang + spread), tip.y - size * Math.sin(ang + spread));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** A ∪ glyph on a small white-filled circle badge, so it reads clearly over the graph. */
function drawBadge(
  ctx: CanvasRenderingContext2D,
  at: Point,
  radius: number,
  fontSize: number,
  color: string,
  text: string,
): void {
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, at.x, at.y);
}

export function createClassExpressionOverlay(): ClassExpressionOverlay {
  let regions: Region[] = [];

  function draw(net: OverlayNet, ctx: CanvasRenderingContext2D, groups: ClassExpressionGroup[]): void {
    regions = [];
    if (!groups || groups.length === 0) return;
    ctx.save();
    ctx.setLineDash([]);
    for (const group of groups) {
      // Data properties: their class→stub edge is too short for the edge overlay, so instead drop a
      // small ∪ badge overlapping a corner of each member's stub node (label kept intact). Registered
      // as a hit-region so hover shows the union and click opens its modal, as for object props. #59
      if (group.propertyKind === 'data') {
        const glyph = GLYPH[group.operator] ?? '∪';
        const inset = STUB_BADGE_RADIUS * 0.6; // nudge inward so the badge sits ON the node corner
        for (const member of group.members) {
          const stubId = dataStubId(net, group, member);
          if (!stubId) continue;
          const box = nodeBox(net, stubId);
          if (!box) continue;
          const edge = findEdge(net, member, stubId);
          const color = (edge && colorOf(edge)) || DATA_FALLBACK_COLOR;
          const at: Point = group.position === 'range'
            ? { x: box.right - inset, y: box.top + inset }
            : { x: box.left + inset, y: box.top + inset };
          drawBadge(ctx, at, STUB_BADGE_RADIUS, STUB_GLYPH_SIZE, color, glyph);
          regions.push({ group, center: at, radius: STUB_BADGE_RADIUS, segments: [] });
        }
        continue;
      }
      // Dot position along each member edge: ¼ from the domain end, or ¾ for a range union.
      const t = group.position === 'domain' ? 0.25 : 0.75;
      const targetId = group.range ?? null; // object-property range class (shared by all members)
      if (!targetId) continue;
      const dots: Point[] = [];
      let color: string | null = null;
      for (const member of group.members) {
        const memberPos = nodePos(net, member);
        if (!memberPos) continue;
        const target = nodePos(net, targetId);
        if (!target) continue;
        const edge = findEdge(net, member, targetId);
        if (edge && !color) color = colorOf(edge);
        // Sample the ¼ point on the real edge curve; fall back to a straight chord if unavailable.
        dots.push(edgePoint(edge, member, t) ?? lerp(memberPos, target, t));
      }
      if (dots.length < 2) continue;
      const stroke = color ?? FALLBACK_COLOR;
      const glyph = GLYPH[group.operator] ?? '∪';
      const hub = centroid(dots);
      const segments: Array<[Point, Point]> = [];
      // Any over-long connector "breaks" the whole group: the continuous line + central ∪ give way to
      // short arrows (one per member) pointing inward, each carrying its own small ∪.
      const broken = dots.some((d) => Math.hypot(hub.x - d.x, hub.y - d.y) > BREAK_THRESHOLD);

      for (const d of dots) {
        const len = Math.hypot(hub.x - d.x, hub.y - d.y);
        // Reset stroke each iteration — drawBadge()/drawArrowhead() mutate stroke + fill state.
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = stroke;
        if (!broken) {
          // Whole: a thin line all the way to the shared ∪.
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(hub.x, hub.y);
          ctx.stroke();
          segments.push([d, hub]);
        } else {
          // Broken: a short stub arrowing toward the (now hidden) hub, with its own small ∪.
          const stubEnd = lerp(d, hub, Math.min(1, STUB_LEN / len));
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(stubEnd.x, stubEnd.y);
          ctx.stroke();
          drawArrowhead(ctx, stubEnd, d, ARROW_SIZE, stroke);
          drawBadge(ctx, lerp(d, stubEnd, 0.5), STUB_BADGE_RADIUS, STUB_GLYPH_SIZE, stroke, glyph);
          segments.push([d, stubEnd]);
        }
      }
      // A dot where each edge is "tapped".
      ctx.fillStyle = stroke;
      for (const d of dots) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
      // The shared ∪ badge at the hub — only when the connector is whole (broken arrows carry their own).
      if (!broken) {
        drawBadge(ctx, hub, HUB_RADIUS, HUB_GLYPH_SIZE, stroke, glyph);
      }

      regions.push({ group, center: hub, radius: broken ? 0 : HUB_RADIUS, segments });
    }
    ctx.restore();
  }

  function groupAt(point: Point): ClassExpressionGroup | null {
    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i];
      if (pointNear(point, r.center, r.radius)) return r.group;
      if (r.segments.some(([a, b]) => pointNearSegment(point, a, b, SEGMENT_HIT_TOLERANCE))) return r.group;
    }
    return null;
  }

  return { draw, groupAt };
}
