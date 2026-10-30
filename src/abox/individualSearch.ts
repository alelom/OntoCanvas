/**
 * Individuals and the search (#209). The search dims the class graph; individuals are added after it, so this decides which of
 * them stay while it is active: those of a class the search highlights, those that exhibit a relationship it matches, and
 * those it names. Pure: the sets of the class graph's search in, the layer's view in, a smaller view out.
 */
import type { GraphEdge } from '../types';
import { edgeKey, namesMatch, type SearchHighlightSets } from '../lib/searchHighlight';
import { extractLocalName } from '../utils/localName';
import type { LayerView } from './individualsLayer';

export interface IndividualSearchFilter {
  query: string;
  exactMatch: boolean;
  /** Node ids of the classes the search highlights (matches and, with neighbours, their neighbours). */
  classNodeIds: Set<string>;
  /** Node ids of the classes whose own name matched. */
  directClassNodeIds: Set<string>;
  /** The relationships the search matches, by IRI and by name. */
  edgeTypes: Set<string>;
}

/** The filter for a search that dims the graph, or null when there is none (nothing is hidden then). */
export function individualSearchFilter(
  sets: SearchHighlightSets,
  edges: GraphEdge[],
  objectProperties: Array<{ name: string; uri?: string }>,
  { query, exactMatch }: { query: string; exactMatch: boolean }
): IndividualSearchFilter | null {
  if (!query.trim()) return null;
  const edgeTypes = new Set<string>();
  for (const edge of edges) {
    if (!sets.matchingEdgeIds.has(edgeKey(edge.from, edge.to, edge.type))) continue;
    edgeTypes.add(edge.type);
    const property = objectProperties.find((p) => p.name === edge.type || p.uri === edge.type);
    if (property?.uri) edgeTypes.add(property.uri);
    if (property?.name) edgeTypes.add(property.name);
  }
  return {
    query,
    exactMatch,
    classNodeIds: new Set([...sets.matchingNodeIds, ...sets.neighborNodeIds]),
    directClassNodeIds: sets.directNodeMatchIds,
    edgeTypes,
  };
}

export function filterIndividualsBySearch(view: LayerView, filter: IndividualSearchFilter | null): LayerView {
  if (!filter) return view;
  const keep = new Set<string>();
  for (const node of view.nodes) {
    if (namesMatch([node.label, node.iri, extractLocalName(node.iri)], filter.query, filter.exactMatch)) keep.add(node.id);
  }
  const byRelationship = filter.edgeTypes.size > 0;
  for (const edge of view.edges) {
    if (edge.type === 'rdf:type') {
      // With a relationship matched, its classes are highlighted only as its ends: only a class named itself counts.
      if ((byRelationship ? filter.directClassNodeIds : filter.classNodeIds).has(edge.to)) keep.add(edge.from);
    } else if (filter.edgeTypes.has(edge.type)) {
      keep.add(edge.from);
      keep.add(edge.to);
    }
  }
  const nodes = view.nodes.filter((n) => keep.has(n.id));
  const edges = view.edges.filter((e) => keep.has(e.from) && (e.type === 'rdf:type' || keep.has(e.to)));
  const iris = new Set(nodes.map((n) => n.iri));
  return { ...view, nodes, edges, more: view.more.filter((m) => iris.has(m.iri)) };
}
