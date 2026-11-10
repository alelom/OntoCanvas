/**
 * What the graph draws, as the matching of query results needs it (#203, #207): the class graph, and the individuals layer
 * (#209) drawn over it, whose nodes and links the class graph does not hold.
 */
import type { GraphIndex } from '../sparql/graphMatches';
import { INDIVIDUAL_CLASS_PREFIX, INDIVIDUAL_EDGE_PREFIX, INDIVIDUAL_PREFIX } from '../abox/individualsLayer';
import { canvasState, session } from '../state/appState';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

interface DrawnNode {
  id: string | number;
}
interface DrawnEdge {
  id?: string | number;
  from?: string | number;
  to?: string | number;
  property?: string;
}

/**
 * The class graph with the individuals the canvas draws: each individual by its IRI, each class of the data drawn for them (a
 * stub) by its IRI, and each link between them by its relationship (rdf:type for the link to its class). Pure.
 */
export function withDrawnIndividuals(base: GraphIndex, drawn: { nodes: DrawnNode[]; edges: DrawnEdge[] }): GraphIndex {
  const nodes: GraphIndex['nodes'] = [...base.nodes];
  for (const { id } of drawn.nodes) {
    const key = String(id);
    if (key.startsWith(INDIVIDUAL_PREFIX)) nodes.push({ id: key, uri: key.slice(INDIVIDUAL_PREFIX.length), kind: 'individual' });
    else if (key.startsWith(INDIVIDUAL_CLASS_PREFIX)) nodes.push({ id: key, uri: key.slice(INDIVIDUAL_CLASS_PREFIX.length) });
  }
  const edges: GraphIndex['edges'] = [...base.edges];
  for (const edge of drawn.edges) {
    const id = String(edge.id ?? '');
    if (!id.startsWith(INDIVIDUAL_EDGE_PREFIX)) continue;
    const property = edge.property ?? RDF_TYPE;
    edges.push({ id, from: String(edge.from), to: String(edge.to), type: edge.property ?? 'rdf:type', property });
  }
  return { ...base, nodes, edges };
}

type DataSetLike<T> = { get(): T[] };

/** What is drawn now; null before anything is. */
export function currentGraphIndex(): GraphIndex | null {
  const built = session.currentGraphDataForBuild;
  if (!built) return null;
  const base: GraphIndex = { nodes: built.nodes, edges: built.edges, objectProperties: session.objectProperties };
  const data = (canvasState.network as unknown as { body?: { data: { nodes: DataSetLike<DrawnNode>; edges: DataSetLike<DrawnEdge> } } } | null)?.body?.data;
  return data ? withDrawnIndividuals(base, { nodes: data.nodes.get(), edges: data.edges.get() }) : base;
}
