/**
 * Positioning along the VISIBLE part of an edge: the span between where it leaves one node's outline
 * and enters the other's, less any arrowhead. vis-network edges run centre to centre, so a fraction
 * of the full edge lands partly under the nodes; measuring on the visible span makes the class-
 * expression marks' ¼ / ¾ look right whatever the node sizes. Pure (the caller supplies the edge's
 * point sampler and border parameters) so it can be unit-tested. See issues #59-#62.
 */
import type { Point } from './classExpressionOverlay';

export interface VisibleSpan {
  /** Edge parameter where the visible span starts / ends (node-outline crossings). */
  tStart: number;
  tEnd: number;
  /** Pixels excluded at each end (an arrowhead drawn there). */
  trimStart: number;
  trimEnd: number;
}

/** vis-network's arrowhead length: `15 × scaleFactor + 3 × edge width`. */
export function arrowheadLength(scaleFactor: number, edgeWidth: number): number {
  return 15 * scaleFactor + 3 * edgeWidth;
}

/** Parameter (0 at a, 1 at b) of point p projected onto the straight chord a→b. */
export function chordT(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
}

/**
 * The point at `fraction` (0 = span start, 1 = span end) of the visible span, by distance along the
 * path rather than by curve parameter (a Bézier's parameter isn't proportional to length). The path
 * is sampled at `samples` steps between the two border crossings; the trims are then cut off each
 * end. Null when no visible length remains (overlapping nodes, or arrowheads covering the span).
 */
export function pointAlongVisibleSpan(
  sample: (t: number) => Point,
  span: VisibleSpan,
  fraction: number,
  samples = 24,
): Point | null {
  const pts: Point[] = [];
  for (let i = 0; i <= samples; i++) pts.push(sample(span.tStart + ((span.tEnd - span.tStart) * i) / samples));
  const cumulative = [0];
  for (let i = 1; i < pts.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = cumulative[cumulative.length - 1];
  const visible = total - span.trimStart - span.trimEnd;
  if (!(visible > 0)) return null;
  const target = span.trimStart + visible * fraction;
  for (let i = 1; i < pts.length; i++) {
    if (cumulative[i] >= target) {
      const seg = cumulative[i] - cumulative[i - 1];
      const u = seg === 0 ? 0 : (target - cumulative[i - 1]) / seg;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u };
    }
  }
  return pts[pts.length - 1];
}
