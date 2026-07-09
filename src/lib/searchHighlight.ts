import type { GraphEdge, GraphNode } from '../types';
import { matchesSearch } from '../graph';

/** Opacity applied to matched nodes/edges (full). */
export const OPACITY_MATCH = 1.0;
/** Opacity applied to first-ring neighbours (only when "include neighbours" is on). */
export const OPACITY_NEIGHBOR = 0.65;
/** Opacity applied to everything else (dimmed). */
export const OPACITY_DIM = 0.08;

export interface SearchHighlightSets {
  /** Nodes that match the query directly (or are endpoints of a matched relationship). */
  matchingNodeIds: Set<string>;
  /**
   * Nodes whose own label/id matched the query (a subset of matchingNodeIds). Endpoints
   * that are only matched because they anchor a matched relationship are NOT included, so
   * other relationships between those endpoints do not inherit full opacity.
   */
  directNodeMatchIds: Set<string>;
  /** First-ring neighbours of matched nodes (empty unless includeNeighbors). */
  neighborNodeIds: Set<string>;
  /** Edges whose type matches the query directly. */
  matchingEdgeIds: Set<string>;
}

export function edgeKey(from: string, to: string, type: string): string {
  return `${from}->${to}:${type}`;
}

/**
 * Compute the sets that drive search highlighting.
 *
 * - A node matches if its label/id matches the query; an edge matches if its type does,
 *   in which case both its endpoints become matching nodes.
 * - Neighbours are the nodes exactly one hop from a matching node — and only when
 *   includeNeighbors is true. We deliberately stop at the first ring: neighbours of
 *   neighbours are never collected.
 */
export function computeSearchSets(
  nodes: GraphNode[],
  edges: GraphEdge[],
  query: string,
  includeNeighbors: boolean,
  exactMatch = false
): SearchHighlightSets {
  const matchingNodeIds = new Set<string>();
  const directNodeMatchIds = new Set<string>();
  const neighborNodeIds = new Set<string>();
  const matchingEdgeIds = new Set<string>();
  const q = (query || '').trim();
  if (!q) return { matchingNodeIds, directNodeMatchIds, neighborNodeIds, matchingEdgeIds };

  for (const n of nodes) {
    if (matchesSearch(n, null, q, exactMatch)) {
      matchingNodeIds.add(n.id);
      directNodeMatchIds.add(n.id);
    }
  }
  for (const e of edges) {
    if (matchesSearch(null, e, q, exactMatch)) {
      matchingNodeIds.add(e.from);
      matchingNodeIds.add(e.to);
      matchingEdgeIds.add(edgeKey(e.from, e.to, e.type));
    }
  }

  if (includeNeighbors) {
    for (const e of edges) {
      const fromM = matchingNodeIds.has(e.from);
      const toM = matchingNodeIds.has(e.to);
      // Exactly one endpoint matches -> the other is a first-ring neighbour.
      if (fromM !== toM) neighborNodeIds.add(fromM ? e.to : e.from);
    }
  }

  return { matchingNodeIds, directNodeMatchIds, neighborNodeIds, matchingEdgeIds };
}

/** Opacity for a node given the highlight sets. */
export function getNodeSearchOpacity(
  nodeId: string,
  matchingNodeIds: Set<string>,
  neighborNodeIds: Set<string>
): number {
  if (matchingNodeIds.has(nodeId)) return OPACITY_MATCH;
  if (neighborNodeIds.has(nodeId)) return OPACITY_NEIGHBOR;
  return OPACITY_DIM;
}

/**
 * Opacity for an edge given the highlight sets.
 *
 * An edge is shown at full opacity only if it directly matched the query, or it joins two
 * nodes that BOTH matched the query by name (e.g. searching a node name). Endpoints that
 * are matched only because they anchor the searched relationship do not count — so if the
 * two nodes of a searched relationship are also joined by another relationship, that other
 * relationship stays dimmed, less visible than the searched one.
 *
 * When includeNeighbors is on, an edge from a matched node to a first-ring neighbour is
 * shown dimmed-but-visible; everything else is fully dimmed.
 */
export function getEdgeSearchOpacity(
  from: string,
  to: string,
  type: string,
  sets: SearchHighlightSets,
  includeNeighbors: boolean
): number {
  if (sets.matchingEdgeIds.has(edgeKey(from, to, type))) return OPACITY_MATCH;
  if (sets.directNodeMatchIds.has(from) && sets.directNodeMatchIds.has(to)) return OPACITY_MATCH;
  if (includeNeighbors) {
    const fromM = sets.matchingNodeIds.has(from);
    const toM = sets.matchingNodeIds.has(to);
    const fromN = sets.neighborNodeIds.has(from);
    const toN = sets.neighborNodeIds.has(to);
    if ((fromM && toN) || (toM && fromN)) return OPACITY_NEIGHBOR;
  }
  return OPACITY_DIM;
}
