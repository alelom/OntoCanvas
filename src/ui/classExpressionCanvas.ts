/**
 * vis-network access and canvas drawing primitives shared by the class-expression overlay
 * (classExpressionOverlayRenderer). Kept separate so the renderer reads as "which mark goes where".
 * See issues #59-#62.
 */
import { glyphFontSize, type NodeBox, type Point } from '../graph/classExpressionOverlay';
import { arrowheadLength, chordT, pointAlongVisibleSpan, visibleSpanLength, type VisibleSpan } from '../graph/visibleSpan';

/** A vis edge, as far as the overlay pokes at it. `edgeType.getPoint(t)` samples the real (possibly
 * curved) rendered path at fraction t (0 = `from`, 1 = `to`), tracking the via-node live. */
export interface EdgeLike {
  fromId?: string;
  toId?: string;
  /** The end nodes (vis node objects; centre at x/y). */
  from?: Point;
  to?: Point;
  options?: {
    color?: unknown;
    width?: number;
    smooth?: { enabled?: boolean };
    arrows?: Partial<Record<'from' | 'to', { enabled?: boolean; scaleFactor?: number }>>;
  };
  edgeType?: {
    getPoint?(t: number): { x: number; y: number };
    /** Where the edge crosses `node`'s outline — what vis uses to attach arrowheads. `t` is set for
     * curved edges only (0 for straight ones). */
    findBorderPosition?(node: Point, ctx: CanvasRenderingContext2D): { x: number; y: number; t?: number };
  };
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

/** Length of the arrowhead drawn at one end of the edge, or 0 if none. */
function arrowTrim(edge: EdgeLike, end: 'from' | 'to'): number {
  const arrow = edge.options?.arrows?.[end];
  return arrow?.enabled ? arrowheadLength(arrow.scaleFactor ?? 1, edge.options?.width ?? 1) : 0;
}

/** The edge's VISIBLE part — between the two node outlines, less any arrowhead — oriented from
 * `domainNode`'s end, with a sampler for the real (curved) path. Null if the outlines can't be resolved
 * (e.g. not laid out yet). */
function visibleSpanOf(
  edge: EdgeLike,
  domainNode: string,
  ctx: CanvasRenderingContext2D,
): { sample: (t: number) => Point; span: VisibleSpan } | null {
  const et = edge.edgeType;
  const { from, to } = edge;
  if (!et?.getPoint || !et.findBorderPosition || !from || !to || from === to) return null;
  const atFrom = et.findBorderPosition(from, ctx);
  const atTo = et.findBorderPosition(to, ctx);
  // Curved edges report the border's curve parameter; for straight ones derive it from the chord.
  const curved = edge.options?.smooth?.enabled !== false;
  const tFrom = curved ? atFrom.t : chordT(atFrom, from, to);
  const tTo = curved ? atTo.t : chordT(atTo, from, to);
  if (!Number.isFinite(tFrom) || !Number.isFinite(tTo)) return null;
  const fromSide = { t: tFrom as number, trim: arrowTrim(edge, 'from') };
  const toSide = { t: tTo as number, trim: arrowTrim(edge, 'to') };
  const [start, end] = edge.fromId === domainNode ? [fromSide, toSide] : [toSide, fromSide];
  const span: VisibleSpan = { tStart: start.t, tEnd: end.t, trimStart: start.trim, trimEnd: end.trim };
  return { sample: (t) => et.getPoint!(t), span };
}

/** The point at `fraction` of the edge's visible part, measured from `domainNode`'s end by distance
 * along the path. Null if the outlines can't be resolved or nothing is visible. */
function visibleEdgePoint(edge: EdgeLike, domainNode: string, fraction: number, ctx: CanvasRenderingContext2D): Point | null {
  const v = visibleSpanOf(edge, domainNode, ctx);
  return v ? pointAlongVisibleSpan(v.sample, v.span, fraction) : null;
}

/** Length of the edge's visible part (outline to outline, arrowheads excluded), or null if the outlines
 * can't be resolved. Used to size the badges drawn on it. */
export function visibleEdgeLength(edge: EdgeLike | null, ctx: CanvasRenderingContext2D): number | null {
  if (!edge?.fromId) return null;
  try {
    const v = visibleSpanOf(edge, edge.fromId, ctx);
    return v ? visibleSpanLength(v.sample, v.span) : null;
  } catch {
    return null;
  }
}

/** The point at fraction t measured from `domainNode`'s end along the edge, or null if the edge can't
 * be sampled. Measured on the edge's visible part (outline to outline, arrowheads excluded) so ¼ / ¾
 * look right regardless of node size; falls back to the full centre-to-centre curve when the outlines
 * can't be resolved. Either way it samples the actual rendered curve so marks track curve reshaping —
 * a straight chord's fraction point is invariant to moving a shared endpoint, the real curve's is not. */
export function edgePoint(edge: EdgeLike | null, domainNode: string, t: number, ctx?: CanvasRenderingContext2D): Point | null {
  if (!edge?.edgeType?.getPoint) return null;
  if (ctx) {
    try {
      const visible = visibleEdgePoint(edge, domainNode, t, ctx);
      if (visible) return visible;
    } catch { /* outline not resolvable yet: fall back to the full edge */ }
  }
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
