/**
 * Which drawn nodes and edges a query result names (#203): a class by its IRI, a relationship by the IRI of its property,
 * and rdfs:subClassOf by its own IRI. Pure: no DOM, no graph library. Data properties, individuals and blank nodes are not
 * matched (see the issue).
 */

import type { ResultView } from './resultView';

const RDFS_SUBCLASS_OF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';

/** What the graph draws, as far as matching needs it. */
export interface GraphIndex {
  nodes: Array<{ id: string; uri?: string }>;
  edges: Array<{ from: string; to: string; type: string }>;
  objectProperties: Array<{ name: string; uri?: string }>;
}

export interface GraphMatch {
  nodeIds: string[];
  edgeIds: string[];
  /** True when some property was named without the two ends of an edge, so all the edges of that property are selected. */
  allEdgesOfAProperty?: boolean;
}

const isIri = (value: string): boolean => /^[a-z][a-z\d+.-]*:\/\//i.test(value);

/** The IRI an edge stands for: its property's, `rdfs:subClassOf` for the hierarchy, or its type when that already is one. */
function edgeIri(type: string, objectProperties: GraphIndex['objectProperties']): string | null {
  if (type === 'subClassOf') return RDFS_SUBCLASS_OF;
  const property = objectProperties.find((p) => p.name === type || p.uri === type);
  return property?.uri ?? (isIri(type) ? type : null);
}

/** The nodes and edges of the graph that `iris` name, each once. */
export function matchIrisToGraph(iris: Iterable<string>, graph: GraphIndex): GraphMatch {
  const wanted = new Set(iris);
  const nodeIds = graph.nodes.filter((n) => n.uri && wanted.has(n.uri)).map((n) => n.id);
  const edgeIds = graph.edges
    .filter((e) => {
      const iri = edgeIri(e.type, graph.objectProperties);
      return iri !== null && wanted.has(iri);
    })
    .map((e) => `${e.from}->${e.to}:${e.type}`);
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
      const property = edgeIri(edge.type, graph.objectProperties);
      if (property === null || !iris.has(property)) continue;
      const from = uriOfNode.get(edge.from);
      const to = uriOfNode.get(edge.to);
      if (endsNamed >= 2) {
        if (from && to && iris.has(from) && iris.has(to)) edgeIds.add(`${edge.from}->${edge.to}:${edge.type}`);
      } else {
        edgeIds.add(`${edge.from}->${edge.to}:${edge.type}`);
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

/** What selecting a match does, for the button: "2 classes, 1 relationship". */
export function describeMatch(match: GraphMatch): string {
  const parts: string[] = [];
  if (match.nodeIds.length) parts.push(plural(match.nodeIds.length, 'class', 'classes'));
  if (match.edgeIds.length) parts.push(plural(match.edgeIds.length, 'relationship', 'relationships'));
  return parts.join(', ');
}
