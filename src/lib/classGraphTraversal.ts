import type { GraphEdge } from '../types';

/**
 * Returns the clicked node plus all class nodes reachable by following outgoing edges
 * (transitive closure of "children" / descendants). Only follows class-to-class edges.
 */
export function getTransitiveChildIds(
  nodeId: string,
  edges: GraphEdge[],
  classIds: Set<string>
): string[] {
  const out = new Set<string>([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of edges) {
      if (!classIds.has(e.to)) continue;
      if (out.has(e.from) && !out.has(e.to)) {
        out.add(e.to);
        changed = true;
      }
    }
  }
  return Array.from(out);
}

/**
 * Returns the clicked node plus all class nodes reachable by following incoming edges
 * (transitive closure of "parents" / ancestors). Only follows class-to-class edges.
 */
export function getTransitiveParentIds(
  nodeId: string,
  edges: GraphEdge[],
  classIds: Set<string>
): string[] {
  const out = new Set<string>([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of edges) {
      if (!classIds.has(e.from)) continue;
      if (out.has(e.to) && !out.has(e.from)) {
        out.add(e.from);
        changed = true;
      }
    }
  }
  return Array.from(out);
}
