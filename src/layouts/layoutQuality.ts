import type { GraphEdge } from '../types';

/**
 * Minimal node-size shape (matches NodeDimensions / vis box dims).
 */
export interface QualityDim {
  width: number;
  height: number;
}

/**
 * Distribution-quality metrics for a computed graph layout.
 *
 * These quantify how "spread out" a layout is — the symptom we are fighting is a
 * layout that becomes an extremely wide, short ribbon (huge aspectRatio) forcing
 * the viewport to zoom far out. Lower `aspectRatio`, `spread` and
 * `avgEdgeLenPerDiag` are better.
 */
export interface LayoutQuality {
  nodeCount: number;
  bboxWidth: number;
  bboxHeight: number;
  /** bboxWidth / bboxHeight. ~1 is square; very large means a wide ribbon. */
  aspectRatio: number;
  /** max(w,h)/min(w,h): direction-agnostic imbalance (always >= 1). */
  imbalance: number;
  /** bboxArea / sum(node area). 1 = perfectly packed; large = lots of empty space. */
  spread: number;
  /** Inverse of spread: fraction of the bbox covered by node ink. */
  fillRatio: number;
  /** Mean Euclidean length of hierarchy edges (subClassOf / contains). */
  avgEdgeLen: number;
  /** avgEdgeLen normalised by the average node diagonal (scale-free). */
  avgEdgeLenPerDiag: number;
}

const DEFAULT_HIERARCHY_EDGE_TYPES = new Set(['subClassOf', 'contains']);
const DEFAULT_DIM: QualityDim = { width: 80, height: 40 };

/**
 * Compute distribution-quality metrics for a set of node positions.
 *
 * Pure and side-effect free so it can be reused directly in unit tests and in
 * opt-in debug logging.
 */
export function computeLayoutQuality(
  positions: Record<string, { x: number; y: number }>,
  nodeDimensions: Map<string, QualityDim>,
  edges: GraphEdge[],
  options?: { hierarchyEdgeTypes?: Set<string>; defaultDim?: QualityDim }
): LayoutQuality {
  const hierTypes = options?.hierarchyEdgeTypes ?? DEFAULT_HIERARCHY_EDGE_TYPES;
  const defaultDim = options?.defaultDim ?? DEFAULT_DIM;

  const ids = Object.keys(positions);
  if (ids.length === 0) {
    return {
      nodeCount: 0, bboxWidth: 0, bboxHeight: 0, aspectRatio: 0, imbalance: 1,
      spread: 0, fillRatio: 0, avgEdgeLen: 0, avgEdgeLenPerDiag: 0,
    };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let nodeArea = 0, sumW = 0, sumH = 0;
  for (const id of ids) {
    const p = positions[id];
    const d = nodeDimensions.get(id) ?? defaultDim;
    minX = Math.min(minX, p.x - d.width / 2);
    maxX = Math.max(maxX, p.x + d.width / 2);
    minY = Math.min(minY, p.y - d.height / 2);
    maxY = Math.max(maxY, p.y + d.height / 2);
    nodeArea += d.width * d.height;
    sumW += d.width;
    sumH += d.height;
  }

  const bboxWidth = maxX - minX;
  const bboxHeight = maxY - minY;
  const bboxArea = Math.max(1, bboxWidth * bboxHeight);
  const safeArea = Math.max(1, nodeArea);
  const n = ids.length;
  const avgDiag = Math.max(1, Math.hypot(sumW / n, sumH / n));

  let edgeSum = 0, edgeN = 0;
  for (const e of edges) {
    if (!hierTypes.has(e.type)) continue;
    const a = positions[e.from];
    const b = positions[e.to];
    if (!a || !b) continue;
    edgeSum += Math.hypot(a.x - b.x, a.y - b.y);
    edgeN++;
  }
  const avgEdgeLen = edgeN > 0 ? edgeSum / edgeN : 0;

  const wOverH = bboxHeight > 0 ? bboxWidth / bboxHeight : bboxWidth;
  return {
    nodeCount: n,
    bboxWidth,
    bboxHeight,
    aspectRatio: wOverH,
    imbalance: Math.max(bboxWidth, bboxHeight) / Math.max(1, Math.min(bboxWidth, bboxHeight)),
    spread: bboxArea / safeArea,
    fillRatio: safeArea / bboxArea,
    avgEdgeLen,
    avgEdgeLenPerDiag: avgEdgeLen / avgDiag,
  };
}
