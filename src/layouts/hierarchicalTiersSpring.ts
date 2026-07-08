import type { GraphEdge, NodeDimensions } from '../types';
import { buildLayeredModel, tierYs, placeParkedAside } from './layeredModel';

const CONFIG = {
  minHorizontalGap: 40,
  verticalGap: 150,
  iterations: 90,
  alphaStart: 0.6,
  alphaEnd: 0.05,
};

/**
 * Hierarchical tiers + spring.
 *
 * Vertical tiers come from the shared relationship-aware ranking (fixed y per tier), but
 * horizontal positions are settled by a spring relaxation: each node is pulled toward the
 * average x of its connected neighbours, then same-tier overlaps are resolved and the tier
 * is recentred. The result keeps clean tiers (roots top, leaves bottom) while letting
 * related nodes cluster more organically than the pure barycenter DAG layout.
 */
export function computeHierarchicalTiersSpring(
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
  for (const lvl of levels) {
    let prevRight = -Infinity;
    for (const id of lvl) {
      const halfW = getWidth(id) / 2;
      const left = prevRight === -Infinity ? 0 : prevRight + CONFIG.minHorizontalGap;
      x[id] = left + halfW;
      prevRight = x[id] + halfW;
    }
    if (lvl.length) {
      const last = lvl[lvl.length - 1];
      const c = (x[lvl[0]] - getWidth(lvl[0]) / 2 + x[last] + getWidth(last) / 2) / 2;
      for (const id of lvl) x[id] -= c;
    }
  }

  const neighbours: Record<string, string[]> = {};
  for (const id of model.mainNodes) {
    neighbours[id] = [...(parents[id] || []), ...(children[id] || [])];
  }

  const deoverlapAndCentre = (lvl: string[]) => {
    if (!lvl.length) return;
    const meanBefore = lvl.reduce((a, id) => a + x[id], 0) / lvl.length;
    lvl.sort((a, b) => x[a] - x[b]);
    for (let i = 1; i < lvl.length; i++) {
      const prev = lvl[i - 1], cur = lvl[i];
      const minX = x[prev] + getWidth(prev) / 2 + CONFIG.minHorizontalGap + getWidth(cur) / 2;
      if (x[cur] < minX) x[cur] = minX;
    }
    const meanAfter = lvl.reduce((a, id) => a + x[id], 0) / lvl.length;
    const shift = meanBefore - meanAfter;
    for (const id of lvl) x[id] += shift;
  };

  for (let it = 0; it < CONFIG.iterations; it++) {
    const alpha = CONFIG.alphaStart + (CONFIG.alphaEnd - CONFIG.alphaStart) * (it / (CONFIG.iterations - 1));
    for (const id of model.mainNodes) {
      const ns = neighbours[id];
      if (!ns.length) continue;
      const target = ns.reduce((a, m) => a + x[m], 0) / ns.length;
      x[id] += alpha * (target - x[id]);
    }
    for (let l = 0; l <= maxLevel; l++) deoverlapAndCentre(levels[l]);
  }

  const positions: Record<string, { x: number; y: number }> = {};
  for (let l = 0; l <= maxLevel; l++) {
    for (const id of levels[l]) positions[id] = { x: x[id], y: levelY[l] };
  }
  Object.assign(positions, placeParkedAside(model.parkedComponents, positions, getWidth, getHeight));
  return positions;
}
