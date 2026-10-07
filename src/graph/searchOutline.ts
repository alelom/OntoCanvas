/**
 * Geometry and targets for the search outline (#84): a pulsing outline around what the search matched
 * directly, drawn in an SVG overlay above the graph (ui/searchOutlineOverlay.ts). Pure, so it can be
 * unit-tested.
 */
import type { SearchHighlightSets } from '../lib/searchHighlight';
import type { NodeBox, Point } from './classExpressionOverlay';

/** What gets an outline: only direct matches — not endpoints, neighbours or faded siblings. */
export interface OutlineTargets {
  /** Class nodes matched by their own name. */
  nodeIds: string[];
  /** Data properties matched by name; every box of each is outlined. */
  dataPropertyNames: string[];
  /** Relationships matched by type/name, as vis edge ids (`from->to:type`). */
  edgeIds: string[];
}

export function outlineTargets(sets: SearchHighlightSets, query: string): OutlineTargets {
  if (!(query || '').trim()) return { nodeIds: [], dataPropertyNames: [], edgeIds: [] };
  return {
    nodeIds: [...sets.directNodeMatchIds],
    dataPropertyNames: [...sets.matchingDataPropertyNames],
    edgeIds: [...sets.matchingEdgeIds],
  };
}

/** The graph view as an SVG `matrix(...)`: where graph point (0,0) and (1,0) land on screen give the
 * offset and the (uniform) scale. */
export function viewMatrix(origin: Point, unitX: Point): string {
  const scale = unitX.x - origin.x;
  return `matrix(${scale} 0 0 ${scale} ${origin.x} ${origin.y})`;
}

/** A node box grown by `pad` on every side, as an SVG rect. */
export function outlineRect(box: NodeBox, pad: number): { x: number; y: number; width: number; height: number } {
  return { x: box.left - pad, y: box.top - pad, width: box.right - box.left + 2 * pad, height: box.bottom - box.top + 2 * pad };
}

const inside = (p: Point, b: NodeBox) => p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom;

/** Split a sampled edge path into the runs that lie outside every box (its end nodes, its label), so the
 * stroke reads as drawn beneath them. Runs of fewer than two points are dropped. */
export function polylinesOutsideBoxes(points: Point[], boxes: NodeBox[]): Point[][] {
  const runs: Point[][] = [];
  let run: Point[] = [];
  for (const p of points) {
    if (boxes.some((b) => inside(p, b))) {
      if (run.length > 1) runs.push(run);
      run = [];
    } else {
      run.push(p);
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

/** An SVG path through the points. */
export function polylinePath(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${+p.x.toFixed(2)} ${+p.y.toFixed(2)}`).join(' ');
}

/** The parts of a vis edge that say where it is drawn. */
export interface DrawnEdge {
  fromId?: string;
  toId?: string;
  edgeType?: {
    getPoint?(t: number): Point;
    /** A self-loop's circle `[x, y, radius]` (vis draws it beside the node). */
    _getCircleData?(): [number, number, number];
  };
}

/** `samples + 1` points along where the edge is drawn. A self-loop (foaf:fundedBy, owl:Thing to itself)
 * is a circle beside its node: its getPoint only returns the node centre, so follow the circle instead,
 * the way vis draws it. Empty when vis offers no geometry. */
export function edgeSamplePoints(edge: DrawnEdge, samples: number): Point[] {
  const type = edge.edgeType;
  const ts = Array.from({ length: samples + 1 }, (_, i) => i / samples);
  try {
    if (edge.fromId !== undefined && edge.fromId === edge.toId) {
      if (!type?._getCircleData) return [];
      const [cx, cy, r] = type._getCircleData();
      return ts.map((t) => ({ x: cx + r * Math.cos(t * 2 * Math.PI), y: cy - r * Math.sin(t * 2 * Math.PI) }));
    }
    const getPoint = type?.getPoint;
    return getPoint ? ts.map((t) => getPoint.call(type, t)) : [];
  } catch {
    return [];
  }
}
