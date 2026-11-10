/**
 * Which drawn nodes and edges a query result names (#203): a class by its IRI, a relationship by the IRI of its property,
 * and rdfs:subClassOf by its own IRI; the drawn individuals by their IRI and the links between them by their relationship (#207).
 * Pure: no DOM, no graph library. Data properties and blank nodes are not matched.
 */

import type { ResultView } from './resultView';

const RDFS_SUBCLASS_OF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

/** What the graph draws, as far as matching needs it. */
export interface GraphIndex {
  /** `kind` tells an individual (#209) from a class, which is the default. */
  nodes: Array<{ id: string; uri?: string; kind?: 'class' | 'individual' }>;
  /**
   * A class edge is known by `from->to:type`; a link between individuals (#209) has an `id` of its own, and its relationship's
   * IRI in `property` (rdf:type for the link to its class).
   */
  edges: Array<{ from: string; to: string; type: string; id?: string; property?: string }>;
  objectProperties: Array<{ name: string; uri?: string }>;
}

export interface GraphMatch {
  nodeIds: string[];
  edgeIds: string[];
  /** True when some property was named without the two ends of an edge, so all the edges of that property are selected. */
  allEdgesOfAProperty?: boolean;
}

const isIri = (value: string): boolean => /^[a-z][a-z\d+.-]*:\/\//i.test(value);

type Edge = GraphIndex['edges'][number];

/** The vis id of an edge: its own, or the one a class edge is drawn under. */
const edgeId = (edge: Edge): string => edge.id ?? `${edge.from}->${edge.to}:${edge.type}`;

/** The IRI an edge stands for: its property's, `rdfs:subClassOf` for the hierarchy, or its type when that already is one. */
function edgeIri(edge: Edge, objectProperties: GraphIndex['objectProperties']): string | null {
  if (edge.property) return edge.property;
  const { type } = edge;
  if (type === 'subClassOf') return RDFS_SUBCLASS_OF;
  if (type === 'rdf:type') return RDF_TYPE;
  const property = objectProperties.find((p) => p.name === type || p.uri === type);
  return property?.uri ?? (isIri(type) ? type : null);
}

/** The nodes and edges of the graph that `iris` name, each once. */
export function matchIrisToGraph(iris: Iterable<string>, graph: GraphIndex): GraphMatch {
  const wanted = new Set(iris);
  const nodeIds = graph.nodes.filter((n) => n.uri && wanted.has(n.uri)).map((n) => n.id);
  const edgeIds = graph.edges
    .filter((e) => {
      const iri = edgeIri(e, graph.objectProperties);
      return iri !== null && wanted.has(iri);
    })
    .map(edgeId);
  return { nodeIds: [...new Set(nodeIds)], edgeIds: [...new Set(edgeIds)] };
}

/**
 * What a result table names, row by row. A row that names a property and the two ends of an edge of it is about that edge,
 * and selects it alone; a property named without both ends (a column of properties, a row with one end) selects every edge
 * of the property, which `allEdgesOfAProperty` tells. Classes are matched by IRI, as in matchIrisToGraph.
 */
export function matchTableToGraph(view: Extract<ResultView, { kind: 'table' }>, graph: GraphIndex): GraphMatch {
  const uriOfNode = new Map(graph.nodes.map((n) => [n.id, n.uri] as const));
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  let allEdgesOfAProperty = false;
  for (const row of view.rows) {
    const iris = new Set<string>();
    for (const cell of row) if (cell?.kind === 'iri') iris.add(cell.title);
    for (const id of matchIrisToGraph(iris, graph).nodeIds) nodeIds.add(id);
    const endsNamed = graph.nodes.filter((n) => n.uri && iris.has(n.uri)).length;
    for (const edge of graph.edges) {
      const property = edgeIri(edge, graph.objectProperties);
      if (property === null || !iris.has(property)) continue;
      const from = uriOfNode.get(edge.from);
      const to = uriOfNode.get(edge.to);
      if (endsNamed >= 2) {
        if (from && to && iris.has(from) && iris.has(to)) edgeIds.add(edgeId(edge));
      } else {
        edgeIds.add(edgeId(edge));
        allEdgesOfAProperty = true;
      }
    }
  }
  return { nodeIds: [...nodeIds], edgeIds: [...edgeIds], allEdgesOfAProperty };
}

/** The IRIs in the cells of a result table, once each (literals and blank nodes are not IRIs). */
export function irisInTable(view: Extract<ResultView, { kind: 'table' }>): string[] {
  const iris = new Set<string>();
  for (const row of view.rows) for (const cell of row) if (cell?.kind === 'iri') iris.add(cell.title);
  return [...iris];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What selecting a match does, for the button: "2 individuals, 1 class, 1 relationship". Without the graph, every node is a class. */
export function describeMatch(match: GraphMatch, graph?: GraphIndex): string {
  const parts: string[] = [];
  const individual = new Set(graph?.nodes.filter((n) => n.kind === 'individual').map((n) => n.id) ?? []);
  const individuals = match.nodeIds.filter((id) => individual.has(id)).length;
  const classes = match.nodeIds.length - individuals;
  if (individuals) parts.push(plural(individuals, 'individual', 'individuals'));
  if (classes) parts.push(plural(classes, 'class', 'classes'));
  if (match.edgeIds.length) parts.push(plural(match.edgeIds.length, 'relationship', 'relationships'));
  return parts.join(', ');
}

const RDFS_DOMAIN = 'http://www.w3.org/2000/01/rdf-schema#domain';
const RDFS_RANGE = 'http://www.w3.org/2000/01/rdf-schema#range';

/** A triple of a CONSTRUCT or DESCRIBE result, as far as matching needs it. */
interface TripleLike {
  subject: { termType: string; value: string };
  predicate: { value: string };
  object: { termType: string; value: string };
}

/**
 * What a CONSTRUCT or DESCRIBE result names in the graph (#207): each triple `s p o` is the drawn edge from `s` to `o` of
 * relationship `p` and its two ends. The canvas draws some triples otherwise: `p rdfs:domain A` and `p rdfs:range B` are the
 * edge of `p` from A, or to B. A triple counts as in the graph when it matched an edge or a node; `triples` says how many did.
 */
export function matchQuadsToGraph(quads: Iterable<TripleLike>, graph: GraphIndex): GraphMatch & { triples: { total: number; inGraph: number } } {
  const nodesByUri = new Map<string, string[]>();
  for (const node of graph.nodes) if (node.uri) nodesByUri.set(node.uri, [...(nodesByUri.get(node.uri) ?? []), node.id]);
  const uriOfNode = new Map(graph.nodes.map((n) => [n.id, n.uri] as const));
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  let total = 0;
  let inGraph = 0;
  for (const { subject, predicate, object } of quads) {
    total++;
    const s = subject.termType === 'NamedNode' ? subject.value : null;
    const o = object.termType === 'NamedNode' ? object.value : null;
    const p = predicate.value;
    let found = false;
    for (const edge of graph.edges) {
      const property = edgeIri(edge, graph.objectProperties);
      const from = uriOfNode.get(edge.from);
      const to = uriOfNode.get(edge.to);
      const hit =
        (property === p && from === s && to === o && s !== null) ||
        (p === RDFS_DOMAIN && property === s && from === o) ||
        (p === RDFS_RANGE && property === s && to === o);
      if (hit) {
        edgeIds.add(edgeId(edge));
        found = true;
      }
    }
    for (const iri of [s, o]) {
      for (const id of (iri && nodesByUri.get(iri)) || []) {
        nodeIds.add(id);
        found = true;
      }
    }
    if (found) inGraph++;
  }
  return { nodeIds: [...nodeIds], edgeIds: [...edgeIds], triples: { total, inGraph } };
}
