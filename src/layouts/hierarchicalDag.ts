import type { GraphEdge, NodeDimensions } from '../types';
import { buildLayeredModel, tierYs, placeParkedAside } from './layeredModel';

const CONFIG = {
  minHorizontalGap: 40,
  verticalGap: 150,
  iterations: 16,
};

/**
 * Hierarchical DAG — relationship-aware layered layout.
 *
 * Ranks nodes using the full structural graph (subClassOf/contains + object properties,
 * cycles broken) so entity classes form a deep top-to-bottom flow instead of collapsing
 * into one row. Coordinates are assigned by iterative parent/child barycenter alignment,
 * which lets each parent centre over its children and spread the graph across 2-D space
 * (rather than tight-packing every tier). Disconnected components are parked aside.
 */
export function computeHierarchicalDag(
  nodeIds: Set<string>,
  edges: GraphEdge[],
  spacing: number,
  nodeDimensions?: Map<string, NodeDimensions>
): Record<string, { x: number; y: number }> {
  const model = buildLayeredModel(nodeIds, edges);
  const { levels, maxLevel, parents, children } = model;
  const getWidth = (id: string) => nodeDimensions?.get(id)?.width ?? spacing * 0.45;
  const getHeight = (id: string) => nodeDimensions?.get(id)?.height ?? spacing * 0.3;
  const levelY = tierYs(levels, getHeight, CONFIG.verticalGap);

  const x: Record<string, number> = {};
  // Initial pack per tier, centred on 0.
  for (const lvl of levels) {
    let prevRight = -Infinity;
    for (const id of lvl) {
      const halfW = getWidth(id) / 2;
      const left = prevRight === -Infinity ? 0 : prevRight + CONFIG.minHorizontalGap;
      x[id] = left + halfW;
      prevRight = x[id] + halfW;
    }
    if (lvl.length) {
      const min = x[lvl[0]] - getWidth(lvl[0]) / 2;
      const last = lvl[lvl.length - 1];
      const max = x[last] + getWidth(last) / 2;
      const c = (min + max) / 2;
      for (const id of lvl) x[id] -= c;
    }
  }

  const meanX = (id: string, neigh: Record<string, string[]>): number | null => {
    const ns = (neigh[id] || []).filter((m) => x[m] !== undefined);
    if (!ns.length) return null;
    return ns.reduce((a, m) => a + x[m], 0) / ns.length;
  };

  // Place a tier honouring desired x where possible (left-to-right lower bound prevents
  // overlap), then shift left to recentre on the desired centroid to avoid rightward drift.
  const placeLevel = (lvl: string[], desired: Record<string, number>) => {
    if (!lvl.length) return;
    let prevRight = -Infinity;
    for (const id of lvl) {
      const halfW = getWidth(id) / 2;
      const minC = prevRight === -Infinity ? -Infinity : prevRight + CONFIG.minHorizontalGap + halfW;
      x[id] = Math.max(desired[id] ?? x[id], minC);
      prevRight = x[id] + halfW;
    }
    let wantSum = 0, haveSum = 0;
    for (const id of lvl) { wantSum += desired[id] ?? x[id]; haveSum += x[id]; }
    const shift = (wantSum - haveSum) / lvl.length;
    if (shift < 0) for (const id of lvl) x[id] += shift;
  };

  for (let it = 0; it < CONFIG.iterations; it++) {
    for (let l = 1; l <= maxLevel; l++) {
      const d: Record<string, number> = {};
      for (const id of levels[l]) d[id] = meanX(id, parents) ?? x[id];
      placeLevel(levels[l], d);
    }
    for (let l = maxLevel - 1; l >= 0; l--) {
      const d: Record<string, number> = {};
      for (const id of levels[l]) d[id] = meanX(id, children) ?? x[id];
      placeLevel(levels[l], d);
    }
  }

  const positions: Record<string, { x: number; y: number }> = {};
  for (let l = 0; l <= maxLevel; l++) {
    for (const id of levels[l]) positions[id] = { x: x[id], y: levelY[l] };
  }
  Object.assign(positions, placeParkedAside(model.parkedComponents, positions, getWidth, getHeight));
  return positions;
}
