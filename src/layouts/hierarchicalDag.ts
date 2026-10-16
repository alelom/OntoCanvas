import type { GraphEdge, NodeDimensions } from '../types';
import { buildLayeredModel, tierYs, placeParkedAside } from './layeredModel';

const CONFIG = {
  minHorizontalGap: 40,
  verticalGap: 150,
  iterations: 16,
};

/**
 * Places one tier: each node as close as possible to its desired x (least squares), keeping the
 * order and at least `gaps[i]` between the centres of nodes i and i+1 (#150).
 *
 * Pool adjacent violators on x minus the cumulative gaps: a crowded group spreads evenly around
 * the mean of what its nodes want, and nodes outside it don't move.
 */
export function placeTier(desired: number[], gaps: number[]): number[] {
  const offset = [0];
  for (const g of gaps) offset.push(offset[offset.length - 1] + g);
  // Runs of consecutive nodes sharing one value of x - offset.
  const blocks: { value: number; size: number }[] = [];
  desired.forEach((d, i) => {
    blocks.push({ value: d - offset[i], size: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].value > blocks[blocks.length - 1].value) {
      const last = blocks.pop()!;
      const prev = blocks[blocks.length - 1];
      prev.value = (prev.value * prev.size + last.value * last.size) / (prev.size + last.size);
      prev.size += last.size;
    }
  });
  const out: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.size; k++) out.push(b.value + offset[out.length]);
  return out;
}

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

  const placeLevel = (lvl: string[], desired: Record<string, number>) => {
    const gaps = lvl.slice(1).map((id, i) => (getWidth(lvl[i]) + getWidth(id)) / 2 + CONFIG.minHorizontalGap);
    const placed = placeTier(lvl.map((id) => desired[id] ?? x[id]), gaps);
    lvl.forEach((id, i) => (x[id] = placed[i]));
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
