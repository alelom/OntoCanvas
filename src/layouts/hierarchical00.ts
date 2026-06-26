import type { GraphEdge, NodeDimensions } from '../types';

/**
 * For hierarchy layout: subClassOf goes subclass→superclass; contains goes container→contained.
 */
function getParentChild(e: GraphEdge): { parent: string; child: string } {
  if (e.type === 'subClassOf') {
    return { parent: e.to, child: e.from };
  }
  return { parent: e.from, child: e.to };
}

const CONFIG = {
  /** Minimum horizontal gap between adjacent nodes on the same level. */
  minHorizontalGap: 26,
  /** Vertical gap between the bottom of one level and the top of the next. */
  verticalGap: 64,
  /** Barycenter ordering sweeps (down+up = 1 sweep) for crossing reduction. */
  orderingSweeps: 4,
  /** Coordinate-assignment iterations (parent/child barycenter alignment). */
  coordIterations: 12,
};

function stableSortBy<T>(arr: T[], key: (x: T) => number): void {
  // Decorate-sort-undecorate to keep it stable across engines.
  const decorated = arr.map((v, i) => ({ v, i, k: key(v) }));
  decorated.sort((a, b) => (a.k - b.k) || (a.i - b.i));
  for (let i = 0; i < arr.length; i++) arr[i] = decorated[i].v;
}

/**
 * Hierarchical 00 — a layered (Sugiyama-style) layout.
 *
 * Unlike hierarchical01/02/03, which recursively re-lay-out a node's subtree once
 * per parent (multiplying horizontal extent on DAGs and producing extreme wide
 * "ribbon" layouts), this algorithm:
 *   1. assigns every node to a single level via longest-path layering, so every
 *      hierarchy edge points strictly downward (parent above child);
 *   2. positions every node exactly once;
 *   3. orders nodes within each level by barycenter sweeps to keep children under
 *      their parents and reduce edge crossings;
 *   4. packs each level horizontally with a fixed minimum gap, so total width is
 *      bounded by the widest level rather than multiplied by fan-out.
 *
 * Roots sit at the top (smallest y), leaves at the bottom (largest y), preserving
 * the directional semantics of the existing hierarchical modes. The result is
 * guaranteed overlap-free, so the caller can skip resolveOverlaps for this mode.
 */
export function computeHierarchical00(
  nodeIds: Set<string>,
  edges: GraphEdge[],
  spacing: number,
  nodeDimensions?: Map<string, NodeDimensions>
): Record<string, { x: number; y: number }> {
  const hierarchyEdges = edges.filter(
    (e) =>
      (e.type === 'subClassOf' || e.type === 'contains') &&
      nodeIds.has(e.from) &&
      nodeIds.has(e.to)
  );

  const children: Record<string, string[]> = {};
  const parents: Record<string, string[]> = {};
  const seenPairs = new Set<string>();
  hierarchyEdges.forEach((e) => {
    const { parent, child } = getParentChild(e);
    if (parent === child) return; // ignore self-loops
    const key = parent + '->' + child;
    if (seenPairs.has(key)) return;
    if (seenPairs.has(child + '->' + parent)) return; // ignore reverse duplicate
    seenPairs.add(key);
    (children[parent] = children[parent] || []).push(child);
    (parents[child] = parents[child] || []).push(parent);
  });

  const getWidth = (id: string) => nodeDimensions?.get(id)?.width ?? spacing * 0.45;
  const getHeight = (id: string) => nodeDimensions?.get(id)?.height ?? spacing * 0.3;

  // 1. Longest-path layering with a cycle guard (memoised DFS over parents).
  const level: Record<string, number> = {};
  // 0 = unvisited, 1 = in progress, 2 = done
  const visitState: Record<string, number> = {};
  const computeLevel = (id: string): number => {
    if (visitState[id] === 2) return level[id];
    if (visitState[id] === 1) return 0; // back-edge in a cycle: break it
    visitState[id] = 1;
    let lv = 0;
    const ps = (parents[id] || []).filter((p) => nodeIds.has(p));
    for (const p of ps) {
      lv = Math.max(lv, computeLevel(p) + 1);
    }
    visitState[id] = 2;
    level[id] = lv;
    return lv;
  };
  for (const id of nodeIds) computeLevel(id);

  const maxLevel = Math.max(0, ...Object.values(level));
  const levels: string[][] = Array.from({ length: maxLevel + 1 }, () => []);
  for (const id of nodeIds) levels[level[id]].push(id);

  // 2. Initial within-level order: DFS preorder from roots keeps subtrees contiguous.
  const roots = [...nodeIds].filter((id) => (level[id] ?? 0) === 0);
  const dfsSeq: Record<string, number> = {};
  const visited = new Set<string>();
  let seq = 0;
  const dfs = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    dfsSeq[id] = seq++;
    (children[id] || [])
      .filter((c) => nodeIds.has(c))
      .forEach((c) => dfs(c));
  };
  roots.forEach((r) => dfs(r));
  for (const id of nodeIds) if (!visited.has(id)) dfsSeq[id] = seq++; // nodes only in cycles
  levels.forEach((lvl) => stableSortBy(lvl, (id) => dfsSeq[id]));

  // 3. Barycenter ordering sweeps to reduce crossings / cluster children under parents.
  const indexInLevels = (): Record<string, number> => {
    const idx: Record<string, number> = {};
    levels.forEach((lvl) => lvl.forEach((id, i) => (idx[id] = i)));
    return idx;
  };
  for (let s = 0; s < CONFIG.orderingSweeps; s++) {
    // Downward: order by mean parent index.
    let idx = indexInLevels();
    for (let l = 1; l <= maxLevel; l++) {
      stableSortBy(levels[l], (id) => {
        const ps = (parents[id] || []).filter((p) => idx[p] !== undefined);
        return ps.length ? ps.reduce((a, p) => a + idx[p], 0) / ps.length : idx[id];
      });
    }
    // Upward: order by mean child index.
    idx = indexInLevels();
    for (let l = maxLevel - 1; l >= 0; l--) {
      stableSortBy(levels[l], (id) => {
        const cs = (children[id] || []).filter((c) => idx[c] !== undefined);
        return cs.length ? cs.reduce((a, c) => a + idx[c], 0) / cs.length : idx[id];
      });
      idx = indexInLevels();
    }
  }

  // 4. Y coordinates: cumulative, so vertical gaps never overlap regardless of heights.
  const levelMaxHeight = levels.map((lvl) =>
    lvl.reduce((m, id) => Math.max(m, getHeight(id)), 0)
  );
  const levelY: number[] = [];
  let yCursor = 0;
  for (let l = 0; l <= maxLevel; l++) {
    yCursor += levelMaxHeight[l] / 2;
    levelY[l] = yCursor;
    yCursor += levelMaxHeight[l] / 2 + CONFIG.verticalGap;
  }

  // 5. X coordinates.
  //
  // Each level is tight-packed (gaps collapsed to exactly minHorizontalGap), so the
  // total width is bounded by the *widest* level — never multiplied by fan-out. Within
  // a level the node's local offset is fixed; we then only translate whole levels to
  // align their centroids with their neighbours' (a width-preserving operation), which
  // keeps children clustered under parents without spreading any level out.
  const localX: Record<string, number> = {};
  const packLevelTight = (lvl: string[]) => {
    let cursor = 0;
    for (let i = 0; i < lvl.length; i++) {
      const id = lvl[i];
      const halfW = getWidth(id) / 2;
      if (i > 0) cursor += CONFIG.minHorizontalGap;
      cursor += halfW;
      localX[id] = cursor;
      cursor += halfW;
    }
    // Centre the level on 0 so per-level translations stay small.
    const width = cursor;
    for (const id of lvl) localX[id] -= width / 2;
  };
  levels.forEach(packLevelTight);

  const levelOffset = new Array<number>(maxLevel + 1).fill(0);
  const xOf = (id: string) => localX[id] + levelOffset[level[id]];
  const meanNeighbourX = (id: string, neigh: Record<string, string[]>): number | null => {
    const ns = (neigh[id] || []).filter((m) => nodeIds.has(m));
    if (ns.length === 0) return null;
    return ns.reduce((a, m) => a + xOf(m), 0) / ns.length;
  };
  const alignLevelToNeighbours = (lvl: string[], neigh: Record<string, string[]>, l: number) => {
    let wantSum = 0, haveSum = 0, cnt = 0;
    for (const id of lvl) {
      const b = meanNeighbourX(id, neigh);
      if (b !== null) { wantSum += b; haveSum += xOf(id); cnt++; }
    }
    if (cnt > 0) levelOffset[l] += (wantSum - haveSum) / cnt;
  };

  for (let it = 0; it < CONFIG.coordIterations; it++) {
    for (let l = 1; l <= maxLevel; l++) alignLevelToNeighbours(levels[l], parents, l);
    for (let l = maxLevel - 1; l >= 0; l--) alignLevelToNeighbours(levels[l], children, l);
  }

  // 6. Assemble, normalised so the layout starts near origin.
  const positions: Record<string, { x: number; y: number }> = {};
  let minLeft = Infinity;
  for (const id of nodeIds) minLeft = Math.min(minLeft, xOf(id) - getWidth(id) / 2);
  if (!Number.isFinite(minLeft)) minLeft = 0;
  for (const id of nodeIds) {
    positions[id] = { x: xOf(id) - minLeft, y: levelY[level[id]] };
  }
  return positions;
}
