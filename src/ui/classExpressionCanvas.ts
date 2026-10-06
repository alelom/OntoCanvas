/**
 * vis-network access and canvas drawing primitives shared by the class-expression overlay
 * (classExpressionOverlayRenderer). Kept separate so the renderer reads as "which mark goes where".
 * See issues #59-#62.
 */
import { glyphFontSize, type NodeBox, type Point } from '../graph/classExpressionOverlay';

/** A vis edge, as far as the overlay pokes at it. `edgeType.getPoint(t)` samples the real (possibly
 * curved) rendered path at fraction t (0 = `from`, 1 = `to`), tracking the via-node live. */
export interface EdgeLike {
  fromId?: string;
  toId?: string;
  options?: { color?: unknown };
  edgeType?: { getPoint?(t: number): { x: number; y: number } };
}

/** The subset of the vis Network API the overlay needs. */
export interface OverlayNet {
  getPositions(ids: string[]): Record<string, { x: number; y: number }>;
  getBoundingBox?(id: string): { top: number; left: number; right: number; bottom: number };
  body?: { edges?: Record<string, EdgeLike> };
}

export function nodePos(net: OverlayNet, id: string): Point | null {
  try {
    const p = net.getPositions([id])[id];
    if (p && Number.isFinite(p.x)) return { x: p.x, y: p.y };
  } catch { /* missing */ }
  return null;
}

export function nodeBox(net: OverlayNet, id: string): NodeBox | null {
  if (!net.getBoundingBox) return null;
  try {
    const bb = net.getBoundingBox(id);
    if (bb && Number.isFinite(bb.left)) return { left: bb.left, top: bb.top, right: bb.right, bottom: bb.bottom };
  } catch { /* not laid out */ }
  return null;
}

/** The stub node id carrying a data property for a class, or null if it isn't on the graph. */
export function dataStubId(net: OverlayNet, classId: string, propertyName: string): string | null {
  for (const id of [`__dataprop__${classId}__${propertyName}`, `__dataproprestrict__${classId}__${propertyName}`]) {
    if (nodePos(net, id)) return id;
  }
  return null;
}

/** The edge between two nodes (either direction), or null. */
export function findEdge(net: OverlayNet, a: string, b: string): EdgeLike | null {
  const edges = net.body?.edges;
  if (!edges) return null;
  for (const key in edges) {
    const e = edges[key];
    if ((e.fromId === a && e.toId === b) || (e.fromId === b && e.toId === a)) return e;
  }
  return null;
}

/** Edge colour, so the overlay matches the relationship it marks. */
export function colorOf(edge: EdgeLike | null): string | null {
  const c = edge?.options?.color;
  if (typeof c === 'string') return c;
  if (c && typeof c === 'object' && typeof (c as { color?: unknown }).color === 'string') {
    return (c as { color: string }).color;
  }
  return null;
}

/** The point at fraction t measured from `domainNode`'s end along the edge's real (curved) path, or
 * null if the edge can't be sampled. Samples the actual rendered curve so marks track curve
 * reshaping — a straight chord's fraction point is invariant to moving a shared endpoint, the real
 * curve's is not. */
export function edgePoint(edge: EdgeLike | null, domainNode: string, t: number): Point | null {
  if (!edge?.edgeType?.getPoint) return null;
  const tEff = edge.fromId === domainNode ? t : 1 - t;
  try {
    const p = edge.edgeType.getPoint(tEff);
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y };
  } catch { /* via node not computed yet */ }
  return null;
}

export function drawArrowhead(ctx: CanvasRenderingContext2D, tip: Point, from: Point, size: number, color: string): void {
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

/** A glyph (∪ ∩ ¬ {}) on a small white-filled circle badge, so it reads clearly over the graph. */
export function drawBadge(
  ctx: CanvasRenderingContext2D,
  at: Point,
  radius: number,
  fontSize: number,
  color: string,
  glyph: string,
): void {
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.font = `bold ${glyphFontSize(glyph, fontSize)}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  // "¬" sits high in the em box; drop it a little so it reads as centred in the circle.
  ctx.fillText(glyph, at.x, glyph === '¬' ? at.y + fontSize * 0.3 : at.y);
}
