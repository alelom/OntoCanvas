import type { GraphEdge, NodeDimensions } from '../types';
import { buildLayeredModel, tierYs, placeParkedAside } from './layeredModel';

const CONFIG = {
  verticalGap: 150,
  iterations: 220,
  idealLengthFactor: 1.25, // ideal edge length relative to average node diagonal
  gravity: 0.28,           // per-iteration pull of each node toward its tier's y
};

/**
 * Hierarchical force-downward.
 *
 * A Fruchterman–Reingold force simulation (repulsion between all nodes + attraction along
 * structural edges) combined with a per-iteration "rank gravity" that pulls each node
 * toward the y of its tier from the shared relationship-aware ranking. The horizontal
 * spread and clustering are organic; the vertical axis keeps the roots-top / leaves-bottom
 * flow. Deterministic: initialised from the tiered packing (no randomness) and relaxed for
 * a fixed number of iterations.
 */
export function computeHierarchicalForceDownward(
  nodeIds: Set<string>,
  edges: GraphEdge[],
  spacing: number,
  nodeDimensions?: Map<string, NodeDimensions>
): Record<string, { x: number; y: number }> {
  const model = buildLayeredModel(nodeIds, edges);
  const { levels, maxLevel, children, level, mainNodes } = model;
  const getWidth = (id: string) => nodeDimensions?.get(id)?.width ?? spacing * 0.45;
  const getHeight = (id: string) => nodeDimensions?.get(id)?.height ?? spacing * 0.3;
  const levelY = tierYs(levels, getHeight, CONFIG.verticalGap);

  // Deterministic init: pack each tier, y = tier.
  const x: Record<string, number> = {};
  const y: Record<string, number> = {};
  for (let l = 0; l <= maxLevel; l++) {
    let cursor = 0;
    for (const id of levels[l]) {
      const halfW = getWidth(id) / 2;
      cursor += halfW;
      x[id] = cursor;
      cursor += halfW + 40;
      y[id] = levelY[l];
    }
    if (levels[l].length) {
      const c = cursor / 2;
      for (const id of levels[l]) x[id] -= c;
    }
  }

  // Average node diagonal -> ideal edge length k.
  let sumDiag = 0;
  for (const id of mainNodes) sumDiag += Math.hypot(getWidth(id), getHeight(id));
  const avgDiag = mainNodes.length ? sumDiag / mainNodes.length : 100;
  const k = CONFIG.idealLengthFactor * avgDiag;

  // Structural edges for attraction (dedup parent->child).
  const springEdges: Array<[string, string]> = [];
  for (const p of Object.keys(children)) {
    for (const c of children[p]) springEdges.push([p, c]);
  }

  let temp = k * 5;
  const cool = temp / (CONFIG.iterations + 1);
  const EPS = 0.01;

  for (let it = 0; it < CONFIG.iterations; it++) {
    const dx: Record<string, number> = {};
    const dy: Record<string, number> = {};
    for (const id of mainNodes) { dx[id] = 0; dy[id] = 0; }

    // Repulsion between all main-node pairs.
    for (let i = 0; i < mainNodes.length; i++) {
      const a = mainNodes[i];
      for (let j = i + 1; j < mainNodes.length; j++) {
        const b = mainNodes[j];
        let ddx = x[a] - x[b];
        let ddy = y[a] - y[b];
        let d = Math.hypot(ddx, ddy);
        if (d < EPS) { ddx = EPS; ddy = 0; d = EPS; }
        const f = (k * k) / d;
        const ux = ddx / d, uy = ddy / d;
        dx[a] += ux * f; dy[a] += uy * f;
        dx[b] -= ux * f; dy[b] -= uy * f;
      }
    }
    // Attraction along structural edges.
    for (const [a, b] of springEdges) {
      let ddx = x[a] - x[b];
      let ddy = y[a] - y[b];
      let d = Math.hypot(ddx, ddy);
      if (d < EPS) { ddx = EPS; ddy = 0; d = EPS; }
      const f = (d * d) / k;
      const ux = ddx / d, uy = ddy / d;
      dx[a] -= ux * f; dy[a] -= uy * f;
      dx[b] += ux * f; dy[b] += uy * f;
    }
    // Apply, capped by temperature.
    for (const id of mainNodes) {
      const dl = Math.hypot(dx[id], dy[id]);
      if (dl > 0) {
        x[id] += (dx[id] / dl) * Math.min(dl, temp);
        y[id] += (dy[id] / dl) * Math.min(dl, temp);
      }
    }
    // Rank gravity: pull y back toward the node's tier so the hierarchy is preserved.
    for (const id of mainNodes) {
      y[id] += CONFIG.gravity * (levelY[level[id]] - y[id]);
    }
    temp = Math.max(k * 0.05, temp - cool);
  }

  const positions: Record<string, { x: number; y: number }> = {};
  for (const id of mainNodes) positions[id] = { x: x[id], y: y[id] };
  Object.assign(positions, placeParkedAside(model.parkedComponents, positions, getWidth, getHeight));
  return positions;
}
