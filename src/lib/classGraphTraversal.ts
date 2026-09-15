import type { GraphEdge } from '../types';

const SUBCLASS_OF = 'subClassOf';

/**
 * Returns the clicked node plus all class nodes "below" it in the graph:
 * - rdfs:subClassOf edges are followed target -> domain (superclass already in the
 *   set pulls in its subclasses), so the full subclass hierarchy under nodeId is included.
 * - Any other property edge is followed domain -> target (once a class is in the set,
 *   what it points to via an object property is included too), so e.g. a subclass that
 *   carries a `hasX` restriction pulls in the restriction's target class.
 * Edges are only followed between class nodes (both endpoints must be in classIds).
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
      if (!classIds.has(e.from) || !classIds.has(e.to)) continue;
      if (e.type === SUBCLASS_OF) {
        if (out.has(e.to) && !out.has(e.from)) {
          out.add(e.from);
          changed = true;
        }
      } else if (out.has(e.from) && !out.has(e.to)) {
        out.add(e.to);
        changed = true;
      }
    }
  }
  return Array.from(out);
}

/**
 * Returns the clicked node plus all class nodes "above" it in the graph:
 * the mirror of getTransitiveChildIds.
 * - rdfs:subClassOf edges are followed domain -> target (a subclass already in the
 *   set pulls in its superclasses), so the full superclass chain above nodeId is included.
 * - Any other property edge is followed target -> domain (once a class is in the set,
 *   whatever points to it via an object property is included too), so e.g. the range of a
 *   restriction pulls in the class(es) that carry that restriction.
 * Edges are only followed between class nodes (both endpoints must be in classIds).
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
      if (!classIds.has(e.from) || !classIds.has(e.to)) continue;
      if (e.type === SUBCLASS_OF) {
        if (out.has(e.from) && !out.has(e.to)) {
          out.add(e.to);
          changed = true;
        }
      } else if (out.has(e.to) && !out.has(e.from)) {
        out.add(e.from);
        changed = true;
      }
    }
  }
  return Array.from(out);
}
