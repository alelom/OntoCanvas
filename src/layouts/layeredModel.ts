import type { GraphEdge, NodeDimensions } from '../types';

/**
 * Shared layered model for the relationship-aware hierarchical layouts
 * (Hierarchical DAG / tiers+spring / force-downward).
 *
 * Unlike hierarchical00 — which levels nodes using only subClassOf/contains and so
 * collapses every "entity" class into one top row — this model ranks using the full
 * structural relationship graph:
 *   - subClassOf:  superclass (edge.to) is the parent, subclass (edge.from) the child;
 *   - everything else (contains + object properties): edge.from is the parent.
 *
 * Inverse object properties (e.g. hasRevision / isRevisionOf) and any other cycles are
 * broken by dropping DFS back-edges, yielding an acyclic ranking graph. Disconnected
 * components are detected so the caller can park them aside instead of inflating the
 * main flow.
 */
export interface LayeredModel {
  /** Tier index per node (0 = top). */
  level: Record<string, number>;
  /** Highest tier index across the main component. */
  maxLevel: number;
  /** Ordered (barycenter-sorted) node ids per tier, main component only. */
  levels: string[][];
  /** Acyclic downward adjacency (parent -> children), whole graph. */
  children: Record<string, string[]>;
  /** Acyclic upward adjacency (child -> parents), whole graph. */
  parents: Record<string, string[]>;
  /** Node ids of the largest connected component (the main flow). */
  mainNodes: string[];
  /** Other connected components (singletons and small clusters) to park aside. */
  parkedComponents: string[][];
}

function getParentChild(e: GraphEdge): { parent: string; child: string } {
  if (e.type === 'subClassOf') {
    return { parent: e.to, child: e.from };
  }
  return { parent: e.from, child: e.to };
}

function stableSortBy<T>(arr: T[], key: (x: T) => number): void {
  const decorated = arr.map((v, i) => ({ v, i, k: key(v) }));
  decorated.sort((a, b) => a.k - b.k || a.i - b.i);
  for (let i = 0; i < arr.length; i++) arr[i] = decorated[i].v;
}

export function buildLayeredModel(nodeIds: Set<string>, edges: GraphEdge[]): LayeredModel {
  // 1. Build the directed ranking adjacency (parent -> child) plus an undirected view.
  const adj: Record<string, Set<string>> = {};
  const undirected: Record<string, Set<string>> = {};
  const link = (a: string, b: string) => {
    (undirected[a] = undirected[a] || new Set()).add(b);
    (undirected[b] = undirected[b] || new Set()).add(a);
  };
  for (const e of edges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
    const { parent, child } = getParentChild(e);
    if (parent === child) continue;
    (adj[parent] = adj[parent] || new Set()).add(child);
    link(parent, child);
  }

  // 2. Connected components (undirected). Largest = main flow; the rest get parked.
  const comp: Record<string, number> = {};
  let nComp = 0;
  for (const start of nodeIds) {
    if (comp[start] !== undefined) continue;
    const stack = [start];
    comp[start] = nComp;
    while (stack.length) {
      const u = stack.pop()!;
      for (const v of undirected[u] || []) {
        if (comp[v] === undefined) { comp[v] = nComp; stack.push(v); }
      }
    }
    nComp++;
  }
  const comps: string[][] = Array.from({ length: nComp }, () => []);
  for (const id of nodeIds) comps[comp[id]].push(id);
  // Sort by size desc, then by a stable key so the result is deterministic.
  comps.forEach((c) => c.sort());
  comps.sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const mainNodes = comps[0] || [];
  const parkedComponents = comps.slice(1);

  // 3. Extract an acyclic ranking graph by dropping DFS back-edges (breaks inverse-property
  //    cycles and any other cycles). Iterate nodes in a deterministic order.
  const color: Record<string, number> = {}; // 0 unset, 1 gray (on stack), 2 black
  const children: Record<string, string[]> = {};
  const order = [...nodeIds].sort();
  const dfs = (u: string) => {
    color[u] = 1;
    const kids = [...(adj[u] || [])].sort();
    for (const v of kids) {
      if (color[v] === 1) continue; // back-edge -> drop
      (children[u] = children[u] || []).push(v);
      if (color[v] === undefined) dfs(v);
    }
    color[u] = 2;
  };
  for (const u of order) if (color[u] === undefined) dfs(u);

  const parents: Record<string, string[]> = {};
  for (const p of Object.keys(children)) {
    for (const c of children[p]) (parents[c] = parents[c] || []).push(p);
  }

  // 4. Longest-path leveling over the acyclic graph.
  const level: Record<string, number> = {};
  const lstate: Record<string, number> = {};
  const computeLevel = (id: string): number => {
    if (lstate[id] === 2) return level[id];
    if (lstate[id] === 1) return 0;
    lstate[id] = 1;
    let lv = 0;
    for (const p of parents[id] || []) lv = Math.max(lv, computeLevel(p) + 1);
    lstate[id] = 2;
    level[id] = lv;
    return lv;
  };
  for (const id of nodeIds) computeLevel(id);

  // 5. Group + order the MAIN component by tier (barycenter crossing reduction).
  const maxLevel = mainNodes.reduce((m, id) => Math.max(m, level[id]), 0);
  const levels: string[][] = Array.from({ length: maxLevel + 1 }, () => []);
  for (const id of mainNodes) levels[level[id]].push(id);

  // Initial order: DFS preorder from tier-0 roots keeps subtrees contiguous.
  const mainSet = new Set(mainNodes);
  const roots = mainNodes.filter((id) => (level[id] ?? 0) === 0);
  const seq: Record<string, number> = {};
  const seen = new Set<string>();
  let s = 0;
  const pre = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    seq[id] = s++;
    for (const c of (children[id] || []).filter((c) => mainSet.has(c))) pre(c);
  };
  roots.sort().forEach(pre);
  for (const id of mainNodes) if (!seen.has(id)) seq[id] = s++;
  levels.forEach((lvl) => stableSortBy(lvl, (id) => seq[id]));

  const indexInLevels = () => {
    const idx: Record<string, number> = {};
    levels.forEach((lvl) => lvl.forEach((id, i) => (idx[id] = i)));
    return idx;
  };
  for (let sweep = 0; sweep < 4; sweep++) {
    let idx = indexInLevels();
    for (let l = 1; l <= maxLevel; l++) {
      stableSortBy(levels[l], (id) => {
        const ps = (parents[id] || []).filter((p) => idx[p] !== undefined);
        return ps.length ? ps.reduce((a, p) => a + idx[p], 0) / ps.length : idx[id];
      });
    }
    idx = indexInLevels();
    for (let l = maxLevel - 1; l >= 0; l--) {
      stableSortBy(levels[l], (id) => {
        const cs = (children[id] || []).filter((c) => idx[c] !== undefined);
        return cs.length ? cs.reduce((a, c) => a + idx[c], 0) / cs.length : idx[id];
      });
      idx = indexInLevels();
    }
  }

  return { level, maxLevel, levels, children, parents, mainNodes, parkedComponents };
}

/** Cumulative tier y-coordinates so vertical gaps never overlap regardless of node heights. */
export function tierYs(
  levels: string[][],
  getHeight: (id: string) => number,
  verticalGap: number
): number[] {
  const ys: number[] = [];
  let cursor = 0;
  for (let l = 0; l < levels.length; l++) {
    const h = levels[l].reduce((m, id) => Math.max(m, getHeight(id)), 0);
    cursor += h / 2;
    ys[l] = cursor;
    cursor += h / 2 + verticalGap;
  }
  return ys;
}

/**
 * Lay parked components out as a compact column to the left of the main layout's bounding
 * box, mirroring the way a user manually parks disconnected nodes (e.g. imported dcommon:*
 * classes) off to the side.
 */
export function placeParkedAside(
  parkedComponents: string[][],
  mainPositions: Record<string, { x: number; y: number }>,
  getWidth: (id: string) => number,
  getHeight: (id: string) => number,
  gap = 40
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  if (parkedComponents.length === 0) return out;

  let mainMinX = Infinity, mainMinY = Infinity;
  for (const id of Object.keys(mainPositions)) {
    mainMinX = Math.min(mainMinX, mainPositions[id].x - getWidth(id) / 2);
    mainMinY = Math.min(mainMinY, mainPositions[id].y - getHeight(id) / 2);
  }
  if (!Number.isFinite(mainMinX)) { mainMinX = 0; mainMinY = 0; }

  // Stack each parked component vertically in a left margin column.
  const colRight = mainMinX - gap * 4;
  let y = Number.isFinite(mainMinY) ? mainMinY : 0;
  for (const compNodes of parkedComponents) {
    const nodes = [...compNodes].sort();
    for (const id of nodes) {
      const w = getWidth(id), h = getHeight(id);
      out[id] = { x: colRight - w / 2, y: y + h / 2 };
      y += h + gap;
    }
    y += gap * 2; // extra gap between components
  }
  return out;
}
