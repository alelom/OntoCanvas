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
