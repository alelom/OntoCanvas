/**
 * The owl:Thing node that data properties with rdfs:domain owl:Thing are drawn under, once, instead of
 * under every class (#80). It is added for display only and behaves like an imported class: dimmed and
 * read-only. Its id is the full owl:Thing IRI, so an owl:Thing node already on the graph is reused.
 */
import type { DataPropertyInfo, GraphData } from '../types';

export const OWL_THING_URI = 'http://www.w3.org/2002/07/owl#Thing';

/** `graph` with an owl:Thing node added when clustering is on and some data property has domain
 * owl:Thing; otherwise `graph` itself. The input graph is not changed. */
export function withThingNode(
  graph: GraphData,
  dataProperties: Pick<DataPropertyInfo, 'domains' | 'hasGlobalDomain'>[],
  cluster: boolean
): GraphData {
  if (!cluster || !dataProperties.some((dp) => dp.hasGlobalDomain && dp.domains.length === 0)) return graph;
  if (graph.nodes.some((n) => n.id === OWL_THING_URI)) return graph;
  return {
    ...graph,
    nodes: [
      ...graph.nodes,
      {
        id: OWL_THING_URI,
        label: 'Thing',
        labellableRoot: null,
        comment: 'owl:Thing, the class of everything. The data properties under it have rdfs:domain owl:Thing, so they apply to every class.',
        isExternal: true,
        externalOntologyUrl: 'http://www.w3.org/2002/07/owl',
      },
    ],
  };
}
