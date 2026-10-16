import type { GraphEdge } from '../types';

/** The relationships that make the tiers when the display config doesn't say (#151). */
export const DEFAULT_HIERARCHY_TYPES: ReadonlySet<string> = new Set(['subClassOf']);

type Adjacency = Record<string, Set<string>>;

const addTo = (map: Adjacency, key: string, value: string) => (map[key] = map[key] || new Set()).add(value);
const sorted = (set: Set<string> | undefined) => [...(set ?? [])].sort();

/** Every node `from` reaches by following `adj` (including itself). */
function reach(adj: Adjacency, from: string): Set<string> {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    for (const v of adj[stack.pop()!] ?? []) {
      if (!seen.has(v)) { seen.add(v); stack.push(v); }
    }
  }
  return seen;
}

/** Longest-path tier per node; an edge closing a loop counts as no edge. */
function tiersOf(nodeIds: Set<string>, adj: Adjacency): Record<string, number> {
  const up: Adjacency = {};
  for (const p of Object.keys(adj)) for (const c of adj[p]) addTo(up, c, p);
  const tier: Record<string, number> = {};
  const state: Record<string, number> = {};
  const visit = (id: string): number => {
    if (state[id] === 2) return tier[id];
    if (state[id] === 1) return -1;
    state[id] = 1;
    let t = 0;
    for (const p of sorted(up[id])) t = Math.max(t, visit(p) + 1);
    state[id] = 2;
    return (tier[id] = t);
  };
  for (const id of [...nodeIds].sort()) visit(id);
  return tier;
}

/**
 * The ranking graph (parent -> children) of the hierarchical layouts (#151).
 *
 * - The relationships in `hierarchyTypes` rank: a superclass above its subclasses (`subClassOf`), the source of any
 *   other ticked relationship above its target ("contains").
 * - Rule 1: a superclass S that nothing contains goes below the nearest common container of the classes containing
 *   its subclasses (direct or not). A container that is S or one of its subclasses doesn't count; with no common
 *   container left, the rule doesn't apply.
 * - Rule 2: a class still without a parent goes below the highest class pointing to it by any relationship. A class
 *   it points to as well doesn't count (a mutual reference says nothing about which is above), nor one that would
 *   put it below one of its own descendants.
 */
export function rankingGraph(nodeIds: Set<string>, edges: GraphEdge[], hierarchyTypes: ReadonlySet<string>): Adjacency {
  const adj: Adjacency = {};
  const subclasses: Adjacency = {};
  const containers: Adjacency = {};
  const referrers: Adjacency = {};
  for (const e of edges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to) || e.from === e.to) continue;
    if (!hierarchyTypes.has(e.type)) addTo(referrers, e.to, e.from);
    else if (e.type === 'subClassOf') { addTo(adj, e.to, e.from); addTo(subclasses, e.to, e.from); }
    else { addTo(adj, e.from, e.to); addTo(containers, e.to, e.from); }
  }

  // Rule 1.
  for (const s of [...nodeIds].sort()) {
    if (!subclasses[s] || containers[s]) continue;
    const family = reach(subclasses, s);
    const holders = new Set<string>();
    for (const d of family) for (const c of containers[d] ?? []) holders.add(c);
    if (holders.size === 0) continue;
    // A class's containers, direct or not, and itself; the nearest common one is the one with the most above it.
    const above = [...holders].map((h) => reach(containers, h));
    const common = [...above[0]].filter((k) => !family.has(k) && above.every((a) => a.has(k)));
    if (common.length === 0) continue;
    const depth = (k: string) => reach(containers, k).size;
    const nearest = common.sort((a, b) => depth(b) - depth(a) || (a < b ? -1 : 1))[0];
    if (!reach(adj, s).has(nearest)) addTo(adj, nearest, s);
  }

  // Rule 2.
  const tier = tiersOf(nodeIds, adj);
  const hasParent = new Set(Object.values(adj).flatMap((cs) => [...cs]));
  for (const x of [...nodeIds].sort()) {
    if (hasParent.has(x)) continue;
    const byTier = sorted(referrers[x]).sort((a, b) => tier[a] - tier[b]);
    const referrer = byTier.find((r) => !referrers[r]?.has(x) && !reach(adj, x).has(r));
    if (referrer) addTo(adj, referrer, x);
  }
  return adj;
}
